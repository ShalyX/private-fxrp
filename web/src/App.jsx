import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Download,
  Clock3,
  ExternalLink,
  FileKey2,
  Fingerprint,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Network,
  RefreshCw,
  ShieldCheck,
  Upload,
  Vault,
  WalletCards
} from "lucide-react";
import {
  BrowserProvider,
  Contract,
  Interface,
  JsonRpcProvider,
  MaxUint256,
  formatUnits,
  getAddress,
  parseUnits,
  verifyTypedData
} from "ethers";
import { pollActionResult } from "./lib/action";
import {
  accessRegistryAbi,
  erc20Abi,
  instructionSenderAbi,
  policyRegistryAbi,
  vaultAbi
} from "./lib/contracts";
import { config, missingConfiguration } from "./lib/config";
import { readableError } from "./lib/errors";
import {
  buildAccessRequest,
  buildCredential,
  computePolicyRulesHash,
  parseCredentialPackage,
  signCredentialPackage
} from "./lib/policy";
import { encryptAccessRequest, fetchTeeInfo } from "./lib/tee";
import { navigationItems, viewForNavigation } from "./lib/navigation";

const credentialTypes = {
  Credential: [
    { name: "account", type: "address" },
    { name: "jurisdiction", type: "string" },
    { name: "investorCategory", type: "uint8" },
    { name: "riskScore", type: "uint16" },
    { name: "expiresAt", type: "uint64" }
  ]
};

const emptySnapshot = {
  policy: null,
  pass: null,
  activeAccess: false,
  position: 0n,
  balance: 0n,
  allowance: 0n,
  decimals: 6
};

function short(value, left = 6, right = 4) {
  if (!value) return "Not available";
  return `${value.slice(0, left)}…${value.slice(-right)}`;
}

function formatUsd(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(formatUnits(value, 6)));
}

function formatDate(timestamp) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(Number(timestamp) * 1000));
}

function StatusDot({ tone = "neutral" }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

function App() {
  const [view, setView] = useState("landing");
  const [account, setAccount] = useState(null);
  const [walletProvider, setWalletProvider] = useState(null);
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const [credential, setCredential] = useState(null);
  const [credentialError, setCredentialError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const [activity, setActivity] = useState([]);
  const [vaultMode, setVaultMode] = useState("deposit");
  const [amount, setAmount] = useState("");
  const fileInput = useRef(null);

  const configured = missingConfiguration.length === 0;
  const localRulesHash = useMemo(
    () => (config.policyRules ? computePolicyRulesHash(config.policyRules) : null),
    []
  );
  const policyMatches =
    snapshot.policy &&
    localRulesHash?.toLowerCase() === snapshot.policy.rulesHash.toLowerCase();
  const credentialMatches =
    credential &&
    account &&
    credential.credential.account.toLowerCase() === account.toLowerCase();
  const issuerMatches =
    credential &&
    snapshot.policy &&
    verifyCredentialIssuer(credential, snapshot.policy.credentialIssuer);
  const readyForRequest =
    configured &&
    account &&
    snapshot.policy?.active &&
    policyMatches &&
    credentialMatches &&
    issuerMatches &&
    !busy;

  const addActivity = useCallback((item) => {
    setActivity((current) => [
      { at: Date.now(), ...item },
      ...current.filter((entry) => entry.key !== item.key)
    ]);
  }, []);

  const refresh = useCallback(
    async (providerOverride, accountOverride) => {
      const selectedAccount = accountOverride || account;
      if (!configured || !selectedAccount) return;
      try {
        const provider =
          providerOverride ||
          walletProvider ||
          new JsonRpcProvider(config.rpcUrl);
        const policyRegistry = new Contract(
          config.addresses.policyRegistry,
          policyRegistryAbi,
          provider
        );
        const accessRegistry = new Contract(
          config.addresses.accessRegistry,
          accessRegistryAbi,
          provider
        );
        const vault = new Contract(config.addresses.vault, vaultAbi, provider);
        const fxrp = new Contract(config.addresses.fxrp, erc20Abi, provider);
        const [
          policy,
          pass,
          activeAccess,
          position,
          balance,
          allowance,
          decimals
        ] = await Promise.all([
          policyRegistry.getPolicy(config.policyId),
          accessRegistry.getAccess(selectedAccount, config.policyId),
          accessRegistry.canAccess(selectedAccount, config.policyId),
          vault.positionOf(selectedAccount),
          fxrp.balanceOf(selectedAccount),
          fxrp.allowance(selectedAccount, config.addresses.vault),
          fxrp.decimals()
        ]);
        setSnapshot({
          policy,
          pass,
          activeAccess,
          position,
          balance,
          allowance,
          decimals: Number(decimals)
        });
      } catch (error) {
        setNotice({ tone: "error", text: readableError(error) });
      }
    },
    [account, configured, walletProvider]
  );

  const connectWallet = async () => {
    if (!window.ethereum) {
      setNotice({ tone: "error", text: "Install a browser wallet to continue." });
      return;
    }
    setBusy("wallet");
    setNotice(null);
    try {
      const chainHex = `0x${config.chainId.toString(16)}`;
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainHex }]
        });
      } catch (error) {
        if (error.code !== 4902) throw error;
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainHex,
              chainName: "Coston2 Testnet",
              nativeCurrency: { name: "Coston2 Flare", symbol: "C2FLR", decimals: 18 },
              rpcUrls: [config.rpcUrl],
              blockExplorerUrls: [config.explorerUrl]
            }
          ]
        });
      }
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const selected = getAddress(accounts[0]);
      setWalletProvider(provider);
      setAccount(selected);
      await refresh(provider, selected);
    } catch (error) {
      setNotice({ tone: "error", text: readableError(error) });
    } finally {
      setBusy("");
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setWalletProvider(null);
    setSnapshot(emptySnapshot);
  };

  useEffect(() => {
    if (!window.ethereum) return undefined;
    const onAccounts = (accounts) => {
      if (!accounts.length) return disconnectWallet();
      const selected = getAddress(accounts[0]);
      setAccount(selected);
      refresh(undefined, selected);
    };
    const onChain = () => window.location.reload();
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [refresh]);

  const ingestCredential = async (text) => {
    try {
      const parsed = parseCredentialPackage(text);
      setCredential(parsed);
      setCredentialError("");
    } catch (error) {
      setCredential(null);
      setCredentialError(readableError(error));
    }
  };

  const onFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 64 * 1024) {
      setCredentialError("Credential package exceeds the 64 KB limit");
      return;
    }
    await ingestCredential(await file.text());
    event.target.value = "";
  };

  const requestAccess = async () => {
    setBusy("request");
    setNotice(null);
    try {
      const signer = await walletProvider.getSigner();
      const nonce = Number(snapshot.pass?.nonce || 0n) + 1;
      const request = buildAccessRequest({
        registry: config.addresses.accessRegistry,
        account,
        policyId: config.policyId,
        rulesHash: snapshot.policy.rulesHash,
        issuer: snapshot.policy.credentialIssuer,
        credentialPackage: credential,
        policy: config.policyRules,
        nonce
      });

      addActivity({
        key: "encrypt",
        title: "Encrypting credential locally",
        detail: "Private fields stay inside the ciphertext.",
        status: "active"
      });
      const tee = await fetchTeeInfo();
      const ciphertext = await encryptAccessRequest(tee.publicKey, request);
      addActivity({
        key: "encrypt",
        title: "Credential encrypted",
        detail: "Ciphertext prepared for confidential evaluation.",
        status: "complete"
      });
      addActivity({
        key: "request",
        title: "Awaiting wallet approval",
        detail: "Confirm the encrypted FCC request in your wallet.",
        status: "active"
      });

      const sender = new Contract(
        config.addresses.instructionSender,
        instructionSenderAbi,
        signer
      );
      const transaction = await sender.requestAccess(ciphertext, {
        value: config.instructionFeeWei
      });
      addActivity({
        key: "request",
        title: "FCC request submitted",
        detail: short(transaction.hash, 10, 6),
        hash: transaction.hash,
        status: "active"
      });
      const receipt = await transaction.wait();
      const instructionId = instructionIdFromReceipt(receipt);
      addActivity({
        key: "request",
        title: "FCC instruction confirmed",
        detail: short(instructionId, 10, 6),
        hash: transaction.hash,
        status: "complete"
      });
      addActivity({
        key: "evaluate",
        title: "Confidential policy evaluation",
        detail: "Waiting for the signed ActionResult.",
        status: "active"
      });

      const action = await pollActionResult(instructionId);
      const accessRegistry = new Contract(
        config.addresses.accessRegistry,
        accessRegistryAbi,
        signer
      );
      const relay = await accessRegistry.submitFccDecision(
        action.data,
        action.actionId,
        action.submissionTag,
        action.status,
        action.signature
      );
      addActivity({
        key: "relay",
        title: "Access pass relayed",
        detail: short(relay.hash, 10, 6),
        hash: relay.hash,
        status: "active"
      });
      await relay.wait();
      addActivity({
        key: "evaluate",
        title: "Confidential policy evaluation",
        detail: "Signed FCC result received.",
        status: "complete"
      });
      addActivity({
        key: "relay",
        title: "Access pass active",
        detail: "The vault can now verify this wallet.",
        hash: relay.hash,
        status: "complete"
      });
      await refresh();
      setNotice({ tone: "success", text: "Private access pass issued." });
    } catch (error) {
      addActivity({
        key: "failed",
        title: "Request stopped",
        detail: readableError(error),
        status: "error"
      });
      setNotice({ tone: "error", text: readableError(error) });
    } finally {
      setBusy("");
    }
  };

  const submitVaultAction = async () => {
    setBusy("vault");
    setNotice(null);
    try {
      const value = parseUnits(amount, snapshot.decimals);
      if (value <= 0n) throw new Error("Enter an amount greater than zero");
      const signer = await walletProvider.getSigner();
      const vault = new Contract(config.addresses.vault, vaultAbi, signer);
      if (vaultMode === "deposit") {
        if (!snapshot.activeAccess) throw new Error("An active access pass is required");
        if (snapshot.allowance < value) {
          const token = new Contract(config.addresses.fxrp, erc20Abi, signer);
          const approval = await token.approve(config.addresses.vault, MaxUint256);
          await approval.wait();
        }
        const transaction = await vault.deposit(value);
        await transaction.wait();
        addActivity({
          key: `deposit-${transaction.hash}`,
          title: "FXRP deposited",
          detail: `${amount} FXRP`,
          hash: transaction.hash,
          status: "complete"
        });
      } else {
        const transaction = await vault.withdraw(value);
        await transaction.wait();
        addActivity({
          key: `withdraw-${transaction.hash}`,
          title: "FXRP withdrawn",
          detail: `${amount} FXRP`,
          hash: transaction.hash,
          status: "complete"
        });
      }
      setAmount("");
      await refresh();
      setNotice({ tone: "success", text: "Vault position updated." });
    } catch (error) {
      setNotice({ tone: "error", text: readableError(error) });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="Veyra">
          <img src="/veyra-mark.png" alt="" />
        </div>
        <nav aria-label="Main navigation">
          {navigationItems.map((item) => {
            const icons = { home: LayoutDashboard, issuer: BadgeCheck, vault: Vault, network: Network };
            const Icon = icons[item.id];
            return (
              <button
                key={item.id}
                className={`nav-icon ${view === item.view ? "active" : ""}`}
                onClick={() => setView(viewForNavigation(item.id))}
                title={item.label}
                aria-label={item.label}
              >
                <Icon />
              </button>
            );
          })}
        </nav>
        <a
          className="nav-icon"
          href="https://dev.flare.network/fdc/guides/fcc/"
          target="_blank"
          rel="noreferrer"
          title="Flare documentation"
        >
          <ExternalLink />
        </a>
      </aside>

      <main>
        <header className="topbar">
          <div className="brand-copy">
            <span className="brand-name">Veyra</span>
            <span className="brand-section">Private FXRP access</span>
          </div>
          <div className="topbar-actions">
            <span className="network-pill"><StatusDot tone="success" /> Coston2</span>
            {account ? (
              <div className="wallet-control">
                <span>{short(account)}</span>
                <button onClick={disconnectWallet} title="Disconnect wallet"><LogOut size={15} /></button>
              </div>
            ) : (
              <button className="button secondary" onClick={connectWallet} disabled={busy === "wallet"}>
                <WalletCards size={17} />
                {busy === "wallet" ? "Connecting" : "Connect wallet"}
              </button>
            )}
          </div>
        </header>

        <div className="workspace">
          {view === "landing" && (
            <LandingPage
              onOpenAccess={() => setView("access")}
              onOpenIssuer={() => setView("issuer")}
              onOpenNetwork={() => setView("network")}
            />
          )}
          {view === "issuer" && (
            <IssuerWorkspace
              account={account}
              walletProvider={walletProvider}
              policy={snapshot.policy}
              busy={busy}
              setBusy={setBusy}
              setNotice={setNotice}
              connectWallet={connectWallet}
              addActivity={addActivity}
            />
          )}
          {view === "vault" && (
            <VaultWorkspace
              account={account}
              snapshot={snapshot}
              vaultMode={vaultMode}
              setVaultMode={setVaultMode}
              amount={amount}
              setAmount={setAmount}
              submitVaultAction={submitVaultAction}
              busy={busy}
              onOpenAccess={() => setView("access")}
            />
          )}
          {view === "network" && <NetworkWorkspace />}
          <div className={view === "access" ? "" : "view-hidden"}>
          <section className="page-heading">
            <div>
              <p className="eyebrow">Confidential eligibility</p>
              <h1>Request FXRP access</h1>
              <p className="subtitle">Prove policy eligibility without publishing credential attributes.</p>
            </div>
            <button className="icon-button" onClick={() => refresh()} disabled={!account || busy} title="Refresh onchain data">
              <RefreshCw size={17} />
            </button>
          </section>

          {missingConfiguration.length > 0 && (
            <div className="banner warning">
              <CircleAlert size={18} />
              <span>Deployment configuration required: {missingConfiguration.join(", ")}</span>
            </div>
          )}
          {notice && (
            <div className={`banner ${notice.tone}`}>
              {notice.tone === "success" ? <Check size={18} /> : <CircleAlert size={18} />}
              <span>{notice.text}</span>
              <button onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          )}

          <section className="status-strip" aria-label="Access workflow">
            <WorkflowStep icon={WalletCards} label="Wallet" complete={Boolean(account)} />
            <ChevronRight className="step-arrow" />
            <WorkflowStep icon={FileKey2} label="Credential" complete={Boolean(credential)} />
            <ChevronRight className="step-arrow" />
            <WorkflowStep icon={Fingerprint} label="Private check" active={busy === "request"} complete={snapshot.activeAccess} />
            <ChevronRight className="step-arrow" />
            <WorkflowStep icon={ShieldCheck} label="Access pass" complete={snapshot.activeAccess} />
          </section>

          <section className="live-proof" aria-label="Verified live deployment">
            <div className="live-proof-heading">
              <div>
                <p className="panel-kicker">Live Coston2 evidence</p>
                <h2>Confidential access verified end to end</h2>
              </div>
              <span className="tag verified"><Check size={13} /> PRODUCTION</span>
            </div>
            <div className="live-proof-grid">
              <Detail label="FCC extension" value={`#${config.liveProof.extensionId || "—"}`} />
              <Detail label="TEE signer" value={short(config.liveProof.teeSigner)} mono />
              <Detail label="Evidence block" value={config.liveProof.evidenceBlock?.toLocaleString() || "—"} mono />
              <div className="proof-links">
                <a href={`${config.explorerUrl}/tx/${config.liveProof.requestTransaction}`} target="_blank" rel="noreferrer">
                  Request tx <ExternalLink size={13} />
                </a>
                <a href={`${config.explorerUrl}/tx/${config.liveProof.relayTransaction}`} target="_blank" rel="noreferrer">
                  Relay tx <ExternalLink size={13} />
                </a>
              </div>
            </div>
            <p className="proof-privacy">
              Public evidence contains the signed eligibility result—not the credential attributes or plaintext request.
            </p>
          </section>

          <div className="dashboard-grid">
            <div className="primary-column">
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Step 1</p>
                    <h2>Signed credential</h2>
                  </div>
                  <span className={`tag ${credential ? "verified" : ""}`}>
                    {credential ? <><Check size={13} /> Loaded</> : "Private input"}
                  </span>
                </div>

                {credential ? (
                  <div className="credential-loaded">
                    <div className="credential-icon"><KeyRound size={20} /></div>
                    <div>
                      <strong>Issuer-signed package</strong>
                      <span>{short(credential.issuerSignature, 10, 6)}</span>
                    </div>
                    <button className="text-button" onClick={() => setCredential(null)}>Replace</button>
                  </div>
                ) : (
                  <button className="upload-zone" onClick={() => fileInput.current?.click()}>
                    <Upload size={22} />
                    <strong>Choose credential package</strong>
                    <span>Signed JSON, up to 64 KB</span>
                  </button>
                )}
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={onFile}
                />
                {credentialError && <p className="field-error">{credentialError}</p>}

                <div className="privacy-row">
                  <LockKeyhole size={16} />
                  <span>Encryption happens in this browser. Only ciphertext is submitted.</span>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Step 2</p>
                    <h2>Policy verification</h2>
                  </div>
                  <span className={`tag ${snapshot.policy?.active && policyMatches ? "verified" : ""}`}>
                    {snapshot.policy?.active && policyMatches ? "Commitment matched" : "Awaiting chain"}
                  </span>
                </div>
                <div className="detail-grid">
                  <Detail label="Policy" value={short(config.policyId, 10, 6)} mono />
                  <Detail label="Issuer" value={short(snapshot.policy?.credentialIssuer)} mono />
                  <Detail
                    label="Jurisdictions"
                    value={config.policyRules?.allowedJurisdictions?.join(", ") || "—"}
                  />
                  <Detail
                    label="Risk ceiling"
                    value={config.policyRules ? `${config.policyRules.maximumRiskScore} / 100` : "—"}
                  />
                </div>
                <div className="commitment">
                  <span>Rules commitment</span>
                  <code>{short(localRulesHash, 14, 10)}</code>
                  <StatusDot tone={policyMatches ? "success" : "neutral"} />
                </div>
              </section>

              <button
                className="button primary request-button"
                onClick={requestAccess}
                disabled={!readyForRequest}
              >
                {busy === "request" ? <LoaderCircle className="spin" size={18} /> : <Fingerprint size={18} />}
                {busy === "request" ? "Processing private request" : "Encrypt and request access"}
              </button>
              {!account && <p className="action-hint">Connect a Coston2 wallet to begin.</p>}
              {account && credential && !credentialMatches && (
                <p className="action-hint error-text">Credential is bound to a different wallet.</p>
              )}
              {account && credential && !issuerMatches && (
                <p className="action-hint error-text">Credential signature does not match the policy issuer.</p>
              )}
            </div>

            <div className="secondary-column">
              <section className={`pass-card ${snapshot.activeAccess ? "active" : ""}`}>
                <div className="pass-top">
                  <span className="pass-label">FXRP access pass</span>
                  <StatusDot tone={snapshot.activeAccess ? "success" : "neutral"} />
                </div>
                <div className="pass-state">
                  <ShieldCheck size={27} />
                  <div>
                    <strong>{snapshot.activeAccess ? "Active" : "Not issued"}</strong>
                    <span>{snapshot.activeAccess ? "Verified on Coston2" : "Complete the private check"}</span>
                  </div>
                </div>
                <div className="pass-metrics">
                  <div><span>USD limit</span><strong>{formatUsd(snapshot.pass?.limitUsd)}</strong></div>
                  <div><span>Expires</span><strong>{formatDate(snapshot.pass?.expiresAt)}</strong></div>
                </div>
              </section>

              <section className="panel vault-panel">
                <div className="panel-header">
                  <div>
                    <p className="panel-kicker">Reference integration</p>
                    <h2>FXRP vault</h2>
                  </div>
                  <Vault size={19} />
                </div>
                <div className="vault-balance">
                  <span>Current position</span>
                  <strong>{formatUnits(snapshot.position, snapshot.decimals)} <small>FXRP</small></strong>
                  <p>Wallet: {formatUnits(snapshot.balance, snapshot.decimals)} FXRP</p>
                </div>
                <div className="segmented">
                  <button className={vaultMode === "deposit" ? "active" : ""} onClick={() => setVaultMode("deposit")}>
                    <ArrowDownToLine size={15} /> Deposit
                  </button>
                  <button className={vaultMode === "withdraw" ? "active" : ""} onClick={() => setVaultMode("withdraw")}>
                    <ArrowUpFromLine size={15} /> Withdraw
                  </button>
                </div>
                <label className="amount-field">
                  <span>Amount</span>
                  <div><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /><b>FXRP</b></div>
                </label>
                <button
                  className="button secondary full"
                  onClick={submitVaultAction}
                  disabled={!account || !amount || busy === "vault" || (vaultMode === "deposit" && !snapshot.activeAccess)}
                >
                  {busy === "vault" && <LoaderCircle className="spin" size={16} />}
                  {vaultMode === "deposit" ? "Deposit FXRP" : "Withdraw FXRP"}
                </button>
              </section>
            </div>
          </div>

          <section className="activity-panel">
            <div className="activity-header">
              <div>
                <p className="panel-kicker">Evidence trail</p>
                <h2>Recent activity</h2>
              </div>
              <span>{activity.length} events</span>
            </div>
            {activity.length ? (
              <div className="activity-list">
                {activity.map((entry) => (
                  <div className="activity-item" key={entry.key}>
                    <div className={`activity-status ${entry.status}`}>
                      {entry.status === "active" ? <LoaderCircle className="spin" /> : entry.status === "error" ? <CircleAlert /> : <Check />}
                    </div>
                    <div><strong>{entry.title}</strong><span>{entry.detail}</span></div>
                    <time>{new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                    {entry.hash && (
                      <a href={`${config.explorerUrl}/tx/${entry.hash}`} target="_blank" rel="noreferrer" title="Open transaction">
                        <ExternalLink size={15} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-activity">
                <Clock3 size={20} />
                <span>Transactions and FCC checkpoints will appear here.</span>
              </div>
            )}
          </section>
          </div>
        </div>
      </main>
    </div>
  );
}

export function LandingPage({ onOpenAccess, onOpenIssuer, onOpenNetwork }) {
  return (
    <div className="landing-page">
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="landing-live-row">
            <span><StatusDot tone="success" /> Live on Coston2</span>
            <span>FCC extension #{config.liveProof.extensionId || "—"}</span>
          </div>
          <p className="eyebrow">Confidential eligibility for FXRP applications</p>
          <h1 aria-label="Eligibility without exposure.">Eligibility without <em>exposure.</em></h1>
          <p className="landing-lede">
            Veyra turns private credentials into narrow, reusable access passes.
            Applications can enforce policy and exposure limits without receiving
            jurisdiction, investor category, or risk data.
          </p>
          <div className="landing-actions">
            <button className="button primary" onClick={onOpenAccess}>
              Request FXRP access <ChevronRight size={17} />
            </button>
            <button className="button secondary" onClick={onOpenIssuer}>
              Open issuer workspace
            </button>
          </div>
          <div className="landing-trust-row" aria-label="Privacy properties">
            <span><Check size={13} /> Browser-encrypted</span>
            <span><Check size={13} /> Wallet-bound</span>
            <span><Check size={13} /> Reusable onchain</span>
          </div>
        </div>
        <div className="decision-demo" aria-label="Private eligibility decision example">
          <div className="decision-topline">
            <div><StatusDot tone="success" /><span>Confidential policy run</span></div>
            <code>policy_01</code>
          </div>
          <div className="decision-body">
            <div className="private-inputs">
              <p>Encrypted credential</p>
              <div><span>Jurisdiction</span><code>••••••••</code></div>
              <div><span>Investor category</span><code>••••••</code></div>
              <div><span>Risk score</span><code>••••</code></div>
              <small><FileKey2 size={13} /> Plaintext never reaches the chain</small>
            </div>
            <div className="decision-rail">
              <span>FCC</span>
              <i />
              <ChevronRight size={16} />
            </div>
            <div className="public-output">
              <p>Access pass</p>
              <strong><Check size={16} /> Approved</strong>
              <dl>
                <div><dt>Limit</dt><dd>$10,000</dd></div>
                <div><dt>Policy</dt><dd>threshold</dd></div>
                <div><dt>Private fields</dt><dd>0 exposed</dd></div>
              </dl>
            </div>
          </div>
          <div className="decision-footer">
            <span>Signed by registered TEE</span>
            <b>PRODUCTION</b>
          </div>
        </div>
      </section>

      <section className="landing-section process-section" aria-labelledby="process-title">
        <div className="landing-section-heading">
          <div><p className="eyebrow">From credential to capability</p><h2 id="process-title">How Veyra works</h2></div>
          <p>Private facts enter the confidential boundary. Only the minimum enforceable result comes out.</p>
        </div>
        <div className="process-grid">
          <article><span className="step-number">01</span><FileKey2 size={21} /><h3>Encrypted in your browser</h3><p>The applicant encrypts an issuer-signed, wallet-bound credential directly to the FCC TEE key.</p></article>
          <article><span className="step-number">02</span><Fingerprint size={21} /><h3>Evaluated inside FCC</h3><p>Veyra verifies the issuer and policy against private fields inside Flare Confidential Compute.</p></article>
          <article><span className="step-number">03</span><BadgeCheck size={21} /><h3>Reusable onchain pass</h3><p>The chain stores only the approved wallet, policy, limit, expiry, and replay-safe nonce.</p></article>
        </div>
      </section>

      <section className="landing-section products-section" aria-labelledby="products-title">
        <div className="products-intro">
          <p className="eyebrow">Composable by design</p>
          <h2 id="products-title" aria-label="One private decision. Multiple FXRP products.">One private decision.<br />Multiple FXRP products.</h2>
          <p>Every integration consumes the same narrow pass—not the credential behind it.</p>
        </div>
        <div className="product-list">
          <article><Vault size={20} /><div><h3>Yield access</h3><p>Gate vault deposits by eligibility and enforce USD-denominated exposure limits.</p></div><span>01</span></article>
          <article><Network size={20} /><div><h3>Liquidity programs</h3><p>Apply policy once across pools, incentives, and liquidity campaigns.</p></div><span>02</span></article>
          <article><BadgeCheck size={20} /><div><h3>Institutional limits</h3><p>Prove an approved limit without publishing the risk inputs used to calculate it.</p></div><span>03</span></article>
        </div>
      </section>

      <section className="landing-proof" aria-labelledby="proof-title">
        <div className="proof-copy">
          <p className="eyebrow">Verifiable deployment</p>
          <h2 id="proof-title">Live Coston2 proof</h2>
          <p>A registered FCC signer completed the encrypted request and relayed the access decision onchain.</p>
          <button className="button proof-button" onClick={onOpenNetwork}>Inspect deployment <ChevronRight size={16} /></button>
        </div>
        <div className="proof-metrics">
          <div><span>FCC extension</span><strong>#{config.liveProof.extensionId || "—"}</strong></div>
          <div><span>TEE status</span><strong className="proof-production"><StatusDot tone="success" /> PRODUCTION</strong></div>
          <div><span>Evidence block</span><strong>{config.liveProof.evidenceBlock?.toLocaleString() || "—"}</strong></div>
          <div><span>TEE signer</span><strong className="mono">{short(config.liveProof.teeSigner)}</strong></div>
        </div>
      </section>

      <section className="landing-cta">
        <div><p className="eyebrow">Private inputs. Public assurance.</p><h2>Make eligibility usable without making it visible.</h2></div>
        <button className="button primary" onClick={onOpenAccess}>Request FXRP access <ChevronRight size={17} /></button>
      </section>
    </div>
  );
}

function VaultWorkspace({
  account,
  snapshot,
  vaultMode,
  setVaultMode,
  amount,
  setAmount,
  submitVaultAction,
  busy,
  onOpenAccess
}) {
  return (
    <div className="section-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Reference integration</p>
          <h1>FXRP vault</h1>
          <p className="subtitle">Use a verified access pass to enforce a USD exposure limit on FXRP.</p>
        </div>
        <Vault size={22} />
      </section>
      <div className="section-grid">
        <section className={`pass-card ${snapshot.activeAccess ? "active" : ""}`}>
          <div className="pass-top"><span className="pass-label">FXRP access pass</span><StatusDot tone={snapshot.activeAccess ? "success" : "neutral"} /></div>
          <div className="pass-state"><ShieldCheck size={27} /><div><strong>{snapshot.activeAccess ? "Active" : "Not issued"}</strong><span>{snapshot.activeAccess ? "Verified on Coston2" : "Request private access first"}</span></div></div>
          <div className="pass-metrics"><div><span>USD limit</span><strong>{formatUsd(snapshot.pass?.limitUsd)}</strong></div><div><span>Expires</span><strong>{formatDate(snapshot.pass?.expiresAt)}</strong></div></div>
          {!snapshot.activeAccess && <button className="button secondary full" onClick={onOpenAccess}>Open access desk</button>}
        </section>
        <section className="panel vault-panel">
          <div className="panel-header"><div><p className="panel-kicker">Onchain position</p><h2>Manage FXRP</h2></div><Vault size={19} /></div>
          <div className="vault-balance"><span>Current position</span><strong>{formatUnits(snapshot.position, snapshot.decimals)} <small>FXRP</small></strong><p>Wallet: {formatUnits(snapshot.balance, snapshot.decimals)} FXRP</p></div>
          <div className="segmented"><button className={vaultMode === "deposit" ? "active" : ""} onClick={() => setVaultMode("deposit")}><ArrowDownToLine size={15} /> Deposit</button><button className={vaultMode === "withdraw" ? "active" : ""} onClick={() => setVaultMode("withdraw")}><ArrowUpFromLine size={15} /> Withdraw</button></div>
          <label className="amount-field"><span>Amount</span><div><input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" /><b>FXRP</b></div></label>
          <button className="button secondary full" onClick={submitVaultAction} disabled={!account || !amount || busy === "vault" || (vaultMode === "deposit" && !snapshot.activeAccess)}>{busy === "vault" && <LoaderCircle className="spin" size={16} />}{vaultMode === "deposit" ? "Deposit FXRP" : "Withdraw FXRP"}</button>
          {!account && <p className="action-hint">Connect a Coston2 wallet to manage the vault.</p>}
        </section>
      </div>
    </div>
  );
}

function NetworkWorkspace() {
  return (
    <div className="section-page">
      <section className="page-heading">
        <div><p className="eyebrow">Deployment status</p><h1>Network</h1><p className="subtitle">Public verification details for the live Coston2 deployment.</p></div>
        <Network size={22} />
      </section>
      <section className="panel network-status-panel">
        <div className="network-status-heading"><div><p className="panel-kicker">Flare Confidential Compute</p><h2>Coston2 testnet</h2></div><span className="tag verified"><Check size={13} /> PRODUCTION</span></div>
        <div className="detail-grid"><Detail label="Chain ID" value={String(config.chainId)} mono /><Detail label="FCC extension" value={`#${config.liveProof.extensionId || "—"}`} /><Detail label="TEE signer" value={short(config.liveProof.teeSigner)} mono /><Detail label="Evidence block" value={config.liveProof.evidenceBlock?.toLocaleString() || "—"} mono /></div>
        <p className="proof-privacy">The simulated TEE is the hackathon-supported Coston2 configuration. Public evidence contains the signed decision, not private credential fields.</p>
        <div className="proof-links network-links"><a href={`${config.explorerUrl}/tx/${config.liveProof.requestTransaction}`} target="_blank" rel="noreferrer">Request transaction <ExternalLink size={13} /></a><a href={`${config.explorerUrl}/tx/${config.liveProof.relayTransaction}`} target="_blank" rel="noreferrer">Relay transaction <ExternalLink size={13} /></a></div>
      </section>
    </div>
  );
}

function IssuerWorkspace({
  account,
  walletProvider,
  policy,
  busy,
  setBusy,
  setNotice,
  connectWallet,
  addActivity
}) {
  const [form, setForm] = useState({
    account: "",
    jurisdiction: "",
    investorCategory: "2",
    riskScore: "",
    expiresAt: defaultExpiry()
  });
  const [credentialJson, setCredentialJson] = useState("");
  const isIssuer =
    account &&
    policy?.credentialIssuer &&
    account.toLowerCase() === policy.credentialIssuer.toLowerCase();

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setCredentialJson("");
  };

  const issueCredential = async (event) => {
    event.preventDefault();
    setBusy("issuer");
    setNotice(null);
    try {
      if (!isIssuer) throw new Error("Connected wallet is not the policy issuer");
      const expiresAt = Math.floor(new Date(form.expiresAt).getTime() / 1000);
      const credential = buildCredential({
        account: form.account,
        jurisdiction: form.jurisdiction,
        investorCategory: Number(form.investorCategory),
        riskScore: Number(form.riskScore),
        expiresAt
      });
      if (credential.riskScore > 100) {
        throw new Error("Risk score must be from 0 to 100 in this issuer profile");
      }
      const signer = await walletProvider.getSigner();
      const credentialPackage = await signCredentialPackage(signer, credential);
      const output = `${JSON.stringify(credentialPackage, null, 2)}\n`;
      setCredentialJson(output);
      addActivity({
        key: `credential-${credential.account}-${credential.expiresAt}`,
        title: "Credential package signed",
        detail: `Bound to ${short(credential.account)}`,
        status: "complete"
      });
      setNotice({
        tone: "success",
        text: "Credential signed locally and ready for secure delivery."
      });
    } catch (error) {
      setNotice({ tone: "error", text: readableError(error) });
    } finally {
      setBusy("");
    }
  };

  const downloadCredential = () => {
    const blob = new Blob([credentialJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "private-fxrp-credential.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyCredential = async () => {
    await navigator.clipboard.writeText(credentialJson);
    setNotice({ tone: "success", text: "Credential package copied." });
  };

  return (
    <div className="issuer-workspace">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Authorized issuance</p>
          <h1>Issue private credential</h1>
          <p className="subtitle">
            Sign wallet-bound eligibility data for private delivery to an applicant.
          </p>
        </div>
        <span className={`issuer-role ${isIssuer ? "authorized" : ""}`}>
          <StatusDot tone={isIssuer ? "success" : "neutral"} />
          {isIssuer ? "Issuer authorized" : "Issuer wallet required"}
        </span>
      </section>

      <div className="banner issuer-note">
        <LockKeyhole size={18} />
        <span>
          This reference console signs verified attributes. Identity verification
          and source records remain in the issuer&apos;s system.
        </span>
      </div>

      <div className="issuer-grid">
        <form className="panel issuer-form" onSubmit={issueCredential}>
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Credential details</p>
              <h2>Applicant eligibility</h2>
            </div>
            <BadgeCheck size={20} />
          </div>

          <label className="form-field full-span">
            <span>Applicant wallet</span>
            <input
              value={form.account}
              onChange={update("account")}
              placeholder="0x..."
              autoComplete="off"
              spellCheck="false"
              required
            />
          </label>
          <div className="form-grid">
            <label className="form-field">
              <span>Jurisdiction</span>
              <input
                value={form.jurisdiction}
                onChange={update("jurisdiction")}
                placeholder="NG"
                maxLength={2}
                required
              />
            </label>
            <label className="form-field">
              <span>Investor category</span>
              <select value={form.investorCategory} onChange={update("investorCategory")}>
                <option value="1">1 - Standard</option>
                <option value="2">2 - Qualified</option>
                <option value="3">3 - Institutional</option>
              </select>
            </label>
            <label className="form-field">
              <span>Risk score</span>
              <input
                value={form.riskScore}
                onChange={update("riskScore")}
                type="number"
                min="0"
                max="100"
                placeholder="20"
                required
              />
            </label>
            <label className="form-field">
              <span>Credential expiry</span>
              <input
                value={form.expiresAt}
                onChange={update("expiresAt")}
                type="datetime-local"
                required
              />
            </label>
          </div>

          {!account ? (
            <button type="button" className="button secondary full issuer-action" onClick={connectWallet}>
              <WalletCards size={17} /> Connect issuer wallet
            </button>
          ) : (
            <button className="button primary full issuer-action" disabled={!isIssuer || busy === "issuer"}>
              {busy === "issuer" ? <LoaderCircle className="spin" size={17} /> : <BadgeCheck size={17} />}
              Sign credential package
            </button>
          )}
        </form>

        <section className={`package-panel ${credentialJson ? "ready" : ""}`}>
          <div className="package-icon">
            {credentialJson ? <Check size={22} /> : <FileKey2 size={22} />}
          </div>
          <p className="panel-kicker">Private deliverable</p>
          <h2>{credentialJson ? "Credential ready" : "No credential signed"}</h2>
          <p>
            {credentialJson
              ? "The package contains the applicant attributes and issuer signature. Send it through a secure channel."
              : "Complete the form and sign with the configured issuer wallet."}
          </p>
          {credentialJson && (
            <>
              <div className="package-preview">
                <span>JSON package</span>
                <code>{credentialJson.length} bytes</code>
              </div>
              <div className="package-actions">
                <button className="button secondary" onClick={copyCredential}>
                  <Copy size={16} /> Copy
                </button>
                <button className="button primary" onClick={downloadCredential}>
                  <Download size={16} /> Download
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function defaultExpiry() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function verifyCredentialIssuer(credentialPackage, issuer) {
  try {
    return (
      verifyTypedData(
        { name: "Private FXRP Credential", version: "1" },
        credentialTypes,
        credentialPackage.credential,
        credentialPackage.issuerSignature
      ).toLowerCase() === issuer.toLowerCase()
    );
  } catch {
    return false;
  }
}

function instructionIdFromReceipt(receipt) {
  const iface = new Interface(instructionSenderAbi);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "AccessEvaluationRequested") return parsed.args.instructionId;
    } catch {
      // Ignore logs emitted by FCC protocol contracts.
    }
  }
  throw new Error("Request receipt did not contain an FCC instruction ID");
}

function WorkflowStep({ icon: Icon, label, active, complete }) {
  return (
    <div className={`workflow-step ${complete ? "complete" : ""} ${active ? "active" : ""}`}>
      <span>{active ? <LoaderCircle className="spin" /> : complete ? <Check /> : <Icon />}</span>
      <b>{label}</b>
    </div>
  );
}

function Detail({ label, value, mono }) {
  return <div className="detail"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

export default App;
