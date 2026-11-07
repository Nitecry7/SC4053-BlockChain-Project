// A MOCK EIP-1193 wallet for browser tests. It is NOT MetaMask and proves nothing about MetaMask.
//
// It is injected with page.addInitScript before the app loads, so the app under test contains no test hook. It
// "signs" by forwarding eth_sendTransaction to a scratch Anvil whose dev accounts are unlocked. No private key is
// involved anywhere. Behaviours the tests drive through window.__mock: account and chain changes, request delays
// (to exercise the pending-wallet guidance) and one-shot rejections (error code 4001, like a user clicking Reject).

export function mockWalletScript({ rpcUrl, accounts }) {
  return `(() => {
    const RPC = ${JSON.stringify(rpcUrl)};
    const ACCOUNTS = ${JSON.stringify(accounts)};
    const state = { selected: 0, chainId: 31337, connected: false, delay: { connect: 0, tx: 0, switch: 0 }, rejectNext: false, sent: [], log: [] };
    const listeners = {};
    const hex = (n) => '0x' + n.toString(16);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const account = () => ACCOUNTS[state.selected];
    const emit = (event, payload) => (listeners[event] || []).slice().forEach((fn) => fn(payload));
    const rejection = () => Object.assign(new Error('User rejected the request.'), { code: 4001, name: 'UserRejectedRequestError' });
    const rpc = async (method, params) => {
      const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const body = await res.json();
      if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code, data: body.error.data });
      return body.result;
    };
    const provider = {
      isMockWallet: true,
      isMetaMask: false,
      request: async ({ method, params = [] }) => {
        state.log.push(method);
        switch (method) {
          case 'eth_requestAccounts': {
            await sleep(state.delay.connect);
            if (state.rejectNext) { state.rejectNext = false; throw rejection(); }
            state.connected = true;
            return [account()];
          }
          case 'eth_accounts': return state.connected ? [account()] : [];
          case 'wallet_getPermissions': return state.connected ? [{ parentCapability: 'eth_accounts' }] : [];
          case 'wallet_requestPermissions': return [{ parentCapability: 'eth_accounts' }];
          case 'eth_chainId': return hex(state.chainId);
          case 'net_version': return String(state.chainId);
          case 'wallet_switchEthereumChain': {
            await sleep(state.delay.switch);
            if (state.rejectNext) { state.rejectNext = false; throw rejection(); }
            state.chainId = parseInt(params[0].chainId, 16);
            emit('chainChanged', hex(state.chainId));
            return null;
          }
          case 'eth_sendTransaction': {
            await sleep(state.delay.tx);
            if (state.rejectNext) { state.rejectNext = false; throw rejection(); }
            const tx = params[0];
            if (tx.from.toLowerCase() !== account().toLowerCase()) throw Object.assign(new Error('The selected account is not the requested sender.'), { code: 4100 });
            const hash = await rpc('eth_sendTransaction', [tx]);
            state.sent.push({ hash, to: tx.to, from: tx.from });
            return hash;
          }
          default: return rpc(method, params);
        }
      },
      on: (event, fn) => { (listeners[event] = listeners[event] || []).push(fn); },
      removeListener: (event, fn) => { listeners[event] = (listeners[event] || []).filter((f) => f !== fn); },
    };
    Object.defineProperty(window, 'ethereum', { value: provider, configurable: true });
    window.__mock = {
      state,
      setAccount: (i) => { state.selected = i; emit('accountsChanged', [account()]); },
      setChain: (id) => { state.chainId = id; emit('chainChanged', hex(id)); },
      setDelay: (kind, ms) => { state.delay[kind] = ms; },
      rejectNext: () => { state.rejectNext = true; },
      sentCount: () => state.sent.length,
      lastSent: () => state.sent[state.sent.length - 1],
    };
    console.info('[mock wallet] injected for browser tests. This is NOT MetaMask.');
  })();`;
}
