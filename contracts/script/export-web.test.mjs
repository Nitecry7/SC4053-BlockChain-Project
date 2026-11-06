// Run with: node --test contracts/script/export-web.test.mjs   (needs a prior `forge build` for the artifact tests)
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import {
  ABI_EXPORTS,
  CONTRACTS_DIR,
  DEFAULT_CHAIN_ID,
  DEFAULT_RPC_URL,
  ExportError,
  applyFiles,
  bytecodeMatches,
  collectDeployment,
  isAddress,
  loadAbis,
  maskImmutables,
  parseArgs,
  parseBroadcast,
  renderAbis,
  renderDeployments,
} from './export-web.mjs';

// SYNTHETIC fixture: the shape matches a real Forge run-latest.json observed on Anvil (top-level CREATE transactions
// with contractName/contractAddress, and receipts with blockNumber as hex), but every value here is made up.
const TF = '0x5fbdb2315678afecb367f032d93f642f64180aa3';
const MF = '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512';
const DEPLOYER = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
const HASH = (n) => `0x${n.toString(16).padStart(64, '0')}`;

function fixture() {
  return {
    chain: 31337,
    transactions: [
      { hash: HASH(1), transactionType: 'CREATE', contractName: 'TokenFactory', contractAddress: TF, transaction: { from: DEPLOYER } },
      { hash: HASH(2), transactionType: 'CREATE', contractName: 'MarketFactory', contractAddress: MF, transaction: { from: DEPLOYER } },
      { hash: HASH(3), transactionType: 'CALL', contractName: 'TokenFactory', function: 'createToken(string,string,uint256)', contractAddress: TF, transaction: { from: DEPLOYER } },
    ],
    pending: [],
    receipts: [
      { transactionHash: HASH(1), blockHash: HASH(0xabc), blockNumber: '0x1', status: '0x1' },
      { transactionHash: HASH(2), blockHash: HASH(0xdef), blockNumber: '0x2', status: '0x1' },
      { transactionHash: HASH(3), blockHash: HASH(0x123), blockNumber: '0x3', status: '0x1' },
    ],
  };
}

test('isAddress accepts 40-hex addresses and rejects everything else', () => {
  assert.equal(isAddress(TF), true);
  assert.equal(isAddress('0x5FbDB2315678afecb367f032d93F642f64180aa3'), true);
  for (const bad of ['', '0x', TF.slice(0, -1), `${TF}0`, TF.replace('0x', ''), '0xZZbdb2315678afecb367f032d93f642f64180aa3', null, undefined, 42]) {
    assert.equal(isAddress(bad), false, String(bad));
  }
});

test('parseBroadcast reads the factories, deployer and first deployment block', () => {
  const r = parseBroadcast(fixture(), 31337);
  assert.deepEqual(r, { deployer: DEPLOYER, tokenFactory: TF, marketFactory: MF, deployBlock: 1, deployBlockHash: HASH(0xabc) });
});

test('a CALL on TokenFactory is not counted as a second CREATE', () => {
  assert.equal(parseBroadcast(fixture(), 31337).tokenFactory, TF);
});

test('parseBroadcast rejects a file for another chain', () => {
  assert.throws(() => parseBroadcast(fixture(), 1), ExportError);
  assert.throws(() => parseBroadcast({ ...fixture(), chain: 1 }, 31337), /chain 1/);
});

test('parseBroadcast rejects a missing or duplicated factory', () => {
  const missing = fixture();
  missing.transactions = missing.transactions.filter((t) => t.contractName !== 'TokenFactory' || t.transactionType !== 'CREATE');
  missing.receipts = missing.receipts.filter((r) => r.transactionHash !== HASH(1)); // keep the file otherwise complete
  assert.throws(() => parseBroadcast(missing, 31337), /exactly one TokenFactory.*found 0/);

  const dup = fixture();
  dup.transactions.push({ ...dup.transactions[1], hash: HASH(9) });
  dup.receipts.push({ transactionHash: HASH(9), blockHash: HASH(0x456), blockNumber: '0x4', status: '0x1' });
  assert.throws(() => parseBroadcast(dup, 31337), /exactly one MarketFactory.*found 2/);
});

test('parseBroadcast rejects malformed addresses, a missing receipt and a bad block hash', () => {
  const badAddr = fixture();
  badAddr.transactions[0].contractAddress = '0x1234';
  assert.throws(() => parseBroadcast(badAddr, 31337), /TokenFactory address is not a valid address/);

  const badFrom = fixture();
  badFrom.transactions[0].transaction.from = 'nope';
  assert.throws(() => parseBroadcast(badFrom, 31337), /deployer address/);

  const noReceipt = fixture();
  noReceipt.receipts = [];
  assert.throws(() => parseBroadcast(noReceipt, 31337), /incomplete/);

  const badHash = fixture();
  badHash.receipts[0].blockHash = '0xabc';
  assert.throws(() => parseBroadcast(badHash, 31337), /block hash/);
});

test('parseArgs applies defaults, overrides and validation', () => {
  const d = parseArgs([], {});
  assert.equal(d.rpcUrl, DEFAULT_RPC_URL);
  assert.equal(d.chainId, DEFAULT_CHAIN_ID);
  assert.equal(d.check, false);

  assert.equal(parseArgs([], { RPC_URL: 'http://127.0.0.1:8546' }).rpcUrl, 'http://127.0.0.1:8546');
  const o = parseArgs(['--rpc-url', 'https://example.test', '--chain-id', '1337', '--check'], {});
  assert.deepEqual([o.rpcUrl, o.chainId, o.check], ['https://example.test', 1337, true]);

  assert.throws(() => parseArgs(['--rpc-url', 'file:///etc/passwd'], {}), /http or https/);
  assert.throws(() => parseArgs(['--rpc-url', 'not a url'], {}), /not a URL/);
  assert.throws(() => parseArgs(['--chain-id', 'abc'], {}), /positive integer/);
  assert.throws(() => parseArgs(['--chain-id', '0'], {}), /positive integer/);
  assert.throws(() => parseArgs(['--rpc-url'], {}), /needs a value/);
  assert.throws(() => parseArgs(['--surprise'], {}), /unknown argument/);
});

test('renderDeployments is deterministic and carries no timestamp', () => {
  const data = {
    deployBlock: 1,
    deployer: DEPLOYER,
    tokenFactory: TF,
    marketFactory: MF,
    market: '0xCafac3dD18aC6c6e92c921884f9E4176737C052c',
    baseToken: { address: '0xa16E02E87b7454126E5E10d957A927A7F5B5d2be', name: 'NTU Token', symbol: 'NTU', decimals: 18 },
    quoteToken: { address: '0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968', name: 'Singapore Dollar X', symbol: 'SGDx', decimals: 18 },
  };
  const a = renderDeployments(31337, data);
  assert.equal(a, renderDeployments(31337, data));
  assert.match(a, /^\/\/ GENERATED/);
  assert.match(a, /31337: \{/);
  assert.doesNotMatch(a, /\b20\d\d-\d\d-\d\d\b|Date|timestamp/i);
  assert.doesNotMatch(a, /blockHash|deployBlockHash/, 'no chain-specific hash: a second fresh Anvil must render the same file');
  assert.ok(a.indexOf('baseToken: { address: "0xa16E') > 0 && a.indexOf('baseToken') < a.indexOf('quoteToken'), 'base before quote');
  assert.match(a, /quoteToken: \{ address: "0xB7A5[^}]*symbol: "SGDx"/);
  assert.match(a, /baseToken: \{ address: "0xa16E[^}]*symbol: "NTU"/);
});

test('rendered abis.ts is valid TypeScript whose ABIs deep-equal the Foundry artifacts', async () => {
  const abis = loadAbis();
  const dir = mkdtempSync(join(tmpdir(), 'export-web-'));
  const file = join(dir, 'abis.ts');
  writeFileSync(file, renderAbis(abis));

  // Node strips the type annotations (`as const`), so importing proves the file parses and exports what it claims.
  const mod = await import(pathToFileURL(file).href);
  for (const [exportName] of ABI_EXPORTS) assert.deepEqual(mod[exportName], abis[exportName], exportName);
  assert.equal(renderAbis(abis), renderAbis(loadAbis()), 'rendering is deterministic');
});

// ABI items compared the way a client sees them. Function parameter NAMES are skipped on purpose: a client encodes calls
// positionally, and OrderBook's stub functions are declared without parameter names (for example cancelOrder(uint256)).
function describe(item) {
  const types = (list = []) => list.map((p) => (p.components ? `(${types(p.components)})${p.type.slice(5)}` : p.type)).join(',');
  const named = (list = []) => list.map((p) => `${p.name}:${p.type}${p.indexed ? ':indexed' : ''}`).join(',');
  if (item.type === 'function') return `function ${item.name}(${types(item.inputs)}) ${item.stateMutability} -> (${types(item.outputs)})`;
  if (item.type === 'event') return `event ${item.name}(${named(item.inputs)})`; // event argument names are decoded by name
  if (item.type === 'error') return `error ${item.name}(${named(item.inputs)})`;
  return `${item.type} ${item.name ?? ''}`;
}

test('the exported OrderBook ABI contains every item of the frozen IOrderBook interface', () => {
  const iface = JSON.parse(readFileSync(join(CONTRACTS_DIR, 'out', 'IOrderBook.sol', 'IOrderBook.json'), 'utf8')).abi;
  const exported = new Set(loadAbis().orderBookAbi.map(describe));
  assert.ok(iface.length >= 30, 'the interface ABI should not be empty');
  const missing = iface.map(describe).filter((entry) => !exported.has(entry));
  assert.deepEqual(missing, [], `IOrderBook items missing from the OrderBook ABI:\n${missing.join('\n')}`);
});

// ---- partial and failed broadcasts ----------------------------------------------------------------------------------

test('parseBroadcast refuses a broadcast that is pending, incomplete or has a failed transaction', () => {
  const pending = fixture();
  pending.pending = [HASH(3)];
  pending.receipts = pending.receipts.slice(0, 2);
  assert.throws(() => parseBroadcast(pending, 31337), /1 pending transaction/);

  const fewReceipts = fixture();
  fewReceipts.receipts = fewReceipts.receipts.slice(0, 2);
  assert.throws(() => parseBroadcast(fewReceipts, 31337), /3 transaction\(s\) but 2 receipt/);

  const failed = fixture();
  failed.receipts[2].status = '0x0';
  assert.throws(() => parseBroadcast(failed, 31337), /did not succeed/);

  const empty = { chain: 31337, transactions: [], receipts: [] };
  assert.throws(() => parseBroadcast(empty, 31337), /0 transaction/);

  const garbledBlock = fixture();
  garbledBlock.receipts[0].blockNumber = 'one';
  assert.throws(() => parseBroadcast(garbledBlock, 31337), ExportError); // an ExportError, not a raw TypeError
});

// ---- bytecode matching ------------------------------------------------------------------------------------------------

test('maskImmutables zeroes only the immutable slots, and bytecodeMatches ignores exactly those bytes', () => {
  const refs = { 7: [{ start: 2, length: 2 }] }; // bytes 2 and 3
  assert.equal(maskImmutables('0xAABBccdd', refs), '0xaabb0000');
  assert.equal(maskImmutables('0xaabbccdd'), '0xaabbccdd');

  const artifact = { code: '0xaabb00000099', immutableReferences: refs };
  assert.equal(bytecodeMatches('0xaabb12340099', artifact), true, 'only the immutable slot differs');
  assert.equal(bytecodeMatches('0xaabb12340098', artifact), false, 'a byte outside the slot differs');
  assert.equal(bytecodeMatches('0xAABB12340099', artifact), true, 'case does not matter');
});

// ---- collectDeployment against a fake chain ---------------------------------------------------------------------------
// `cast` is replaced by an in-memory chain, so the chain checks run without Anvil. They are also run for real against Anvil
// (see docs/ai-audit/test-evidence/person2/p2-3-deployment.md).

const MKT = '0xcafac3dd18ac6c6e92c921884f9e4176737c052c';
const NTU = '0xa16e02e87b7454126e5e10d957a927a7f5b5d2be';
const SGDX = '0xb7a5bd0345ef1cc5e66bf61bdec17d2461fbd968';
const BYTECODE = {
  TokenFactory: { code: '0x6001', immutableReferences: {} },
  MarketFactory: { code: '0x6002', immutableReferences: {} },
  DemoToken: { code: '0x6003', immutableReferences: {} },
  OrderBook: { code: `0x60aa${'00'.repeat(32)}bb`, immutableReferences: { 1: [{ start: 2, length: 32 }] } },
};
const ORDERBOOK_ON_CHAIN = `0x60aa${'11'.repeat(32)}bb`; // same code, different immutable values

function fakeChain(over = {}) {
  const st = {
    chainId: 31337,
    height: 20,
    hashAt: () => HASH(0xabc),
    codes: { [TF]: '0x6001', [MF]: '0x6002', [MKT]: ORDERBOOK_ON_CHAIN, [NTU]: '0x6003', [SGDX]: '0x6003' },
    markets: [MKT],
    base: NTU,
    quote: SGDX,
    issued: [NTU, SGDX],
    factoryTokens: [NTU, SGDX],
    isMarket: [MKT],
    getMarketResult: MKT,
    decimals: 18,
    names: { [NTU]: ['NTU Token', 'NTU'], [SGDX]: ['Singapore Dollar X', 'SGDx'] },
    ...over,
  };
  return {
    checksum: (a) => a,
    run(args) {
      if (args[0] === 'chain-id') return String(st.chainId);
      if (args[0] === 'block-number') return String(st.height);
      if (args[0] === 'block') {
        if (Number(args[1]) > st.height) throw new ExportError('block not found');
        return st.hashAt(Number(args[1]));
      }
      if (args[0] === 'code') return st.codes[args[1]] ?? '0x';
      const [, , sig, arg] = args;
      if (sig.startsWith('getMarkets')) return `[${st.markets.join(', ')}]`;
      if (sig.startsWith('getTokens')) return `[${st.issued.join(', ')}]`;
      if (sig.startsWith('isMarket')) return String(st.isMarket.includes(arg));
      if (sig.startsWith('isFactoryToken')) return String(st.factoryTokens.includes(arg));
      if (sig.startsWith('decimals')) return String(st.decimals);
      throw new Error(`fake cast: unhandled ${args.join(' ')}`);
    },
    callAddress(_to, sig) {
      if (sig.startsWith('baseToken')) return st.base;
      if (sig.startsWith('quoteToken')) return st.quote;
      if (sig.startsWith('getMarket')) return st.getMarketResult;
      throw new Error(`fake cast: unhandled ${sig}`);
    },
    callString: (to, sig) => st.names[to][sig.startsWith('name') ? 0 : 1],
  };
}

const collect = (over, mutateFixture) => {
  const broadcast = fixture();
  mutateFixture?.(broadcast);
  return collectDeployment({ broadcast, chainId: 31337, rpcUrl: 'http://127.0.0.1:8545', bytecode: BYTECODE, cast: fakeChain(over) });
};

test('collectDeployment returns the validated deployment from a healthy chain', () => {
  const d = collect();
  assert.equal(d.deployBlock, 1);
  assert.equal(d.deployer, DEPLOYER);
  assert.deepEqual([d.tokenFactory, d.marketFactory, d.market], [TF, MF, MKT]);
  assert.deepEqual(d.baseToken, { address: NTU, name: 'NTU Token', symbol: 'NTU', decimals: 18 });
  assert.deepEqual(d.quoteToken, { address: SGDX, name: 'Singapore Dollar X', symbol: 'SGDx', decimals: 18 });
});

test('collectDeployment rejects a different chain id', () => {
  assert.throws(() => collect({ chainId: 1 }), /RPC reports chain 1/);
});

test('collectDeployment detects a restarted chain: block missing, or present with a different hash', () => {
  assert.throws(() => collect({ height: 0 }), /stale deployment: block 1 does not exist on this chain \(height 0\)/);
  assert.throws(() => collect({ hashAt: () => HASH(0x999) }), /stale deployment: block 1 on this chain is/);
});

test('collectDeployment rejects missing code and bytecode that differs from the current build', () => {
  assert.throws(() => collect({ codes: { [MF]: '0x6002' } }), /no contract code at TokenFactory/);
  assert.throws(() => collect({ codes: { [TF]: '0x6001', [MF]: '0x6002', [MKT]: ORDERBOOK_ON_CHAIN } }), /no contract code at (base|quote) token/);
  assert.throws(() => collect({ codes: { [TF]: '0x6999', [MF]: '0x6002' } }), /bytecode of TokenFactory.*does not match the current build/);
  assert.throws(() => collect({ codes: { [TF]: '0x6001', [MF]: '0x6002', [MKT]: '0x60aa' + '11'.repeat(32) + 'cc', [NTU]: '0x6003', [SGDX]: '0x6003' } }), /bytecode of OrderBook/);
  assert.throws(() => collect({ codes: { [TF]: '0x6001', [MF]: '0x6002', [MKT]: ORDERBOOK_ON_CHAIN, [NTU]: '0x6999', [SGDX]: '0x6003' } }), /bytecode of DemoToken/);
});

test('collectDeployment accepts differing immutable values in OrderBook (they depend on the token addresses)', () => {
  assert.doesNotThrow(() => collect({ codes: { [TF]: '0x6001', [MF]: '0x6002', [MKT]: `0x60aa${'77'.repeat(32)}bb`, [NTU]: '0x6003', [SGDX]: '0x6003' } }));
});

test('collectDeployment requires the seed market, not just any registered market', () => {
  assert.throws(() => collect({ markets: [] }), /no markets/);
  // Someone else listed the pair the other way round before the deployer did.
  assert.throws(() => collect({ base: SGDX, quote: NTU }), /not the deployment script's seed market/);
  assert.throws(() => collect({ issued: [NTU] }), /not the deployment script's seed market/);
  assert.throws(() => collect({ issued: [SGDX, NTU] }), /not the deployment script's seed market/);
});

test('collectDeployment cross-checks the registries and token properties', () => {
  assert.throws(() => collect({ isMarket: [] }), /not registered as a market/);
  assert.throws(() => collect({ getMarketResult: '0x1111111111111111111111111111111111111111' }), /getMarket\(base, quote\) does not return the market/);
  assert.throws(() => collect({ factoryTokens: [SGDX] }), /not issued by this TokenFactory/);
  assert.throws(() => collect({ decimals: 6 }), /6 decimals, expected 18/);
});

test('collectDeployment refuses an incomplete broadcast before touching the chain', () => {
  assert.throws(() => collect({}, (b) => { b.pending = [HASH(3)]; }), /pending/);
});

// ---- writing and checking the generated files -------------------------------------------------------------------------

test('applyFiles writes, then --check passes, and a changed or missing file fails without writing', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'export-web-apply-')), 'out');
  const files = { 'a.ts': 'one\n', 'b.ts': 'two\n' };

  assert.throws(() => applyFiles(files, dir, true), /out of date: a\.ts, b\.ts/); // missing files
  assert.equal(existsSync(join(dir, 'a.ts')), false, 'check mode never writes');

  assert.equal(applyFiles(files, dir, false), 'written');
  assert.equal(readFileSync(join(dir, 'a.ts'), 'utf8'), 'one\n');
  assert.equal(applyFiles(files, dir, true), 'up-to-date');

  writeFileSync(join(dir, 'b.ts'), 'edited\n');
  assert.throws(() => applyFiles(files, dir, true), /out of date: b\.ts/);
  assert.equal(readFileSync(join(dir, 'b.ts'), 'utf8'), 'edited\n', 'check mode leaves the file alone');
});
