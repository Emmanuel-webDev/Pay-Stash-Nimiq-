import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { History, House, Target, Send, RotateCcw } from 'lucide-react'
import logoUrl from '../assets/logo.svg'
import { useAppState } from '../state/AppState'
import { shortenAddress } from '../lib/format'
import './Shell.css'

function navItemClass({ isActive }: { isActive: boolean }): string {
  return `nav-item${isActive ? ' nav-item-active' : ''}`
}

// Nimiq Pay already shows its own TESTNET badge, but that's the host app's
// signal, not Stash's own — without this, Stash's own screens give no
// indication these are test funds. Reads from config so it disappears on a
// mainnet build rather than needing a code change.
const isTestnet = import.meta.env.VITE_NIMIQ_NETWORK !== 'mainnet'

export function Shell() {
  const { wallet, consensus } = useAppState()
  const navigate = useNavigate()
  const [walletDisclosureOpen, setWalletDisclosureOpen] = useState(false)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <img src={logoUrl} alt="Stash" width={22} height={22} />
          </span>
          <span className="brand-name">stash</span>
        </div>

        <button className="topbar-activity" onClick={() => navigate('/activity')}>
          <History size={16} strokeWidth={2} />
          Activity
        </button>

        <div className="wallet-chip-wrap">
          {isTestnet && <span className="network-badge">Testnet</span>}
          <button
            className="wallet-chip"
            onClick={() => setWalletDisclosureOpen((v) => !v)}
            disabled={wallet.status !== 'connected'}
          >
            {wallet.status === 'connected' ? (
              <>
                <span className={`wallet-dot ${consensus === 'established' ? 'wallet-dot-ok' : 'wallet-dot-warn'}`} />
                {shortenAddress(wallet.address)}
              </>
            ) : (
              <span className="wallet-dot wallet-dot-off" />
            )}
          </button>
          {walletDisclosureOpen && wallet.status === 'connected' && (
            <div className="wallet-popover" role="status">
              <strong>Wallet connected</strong>
              <span className="address">{wallet.address}</span>
              <button className="text-link" onClick={() => navigate('/savings')}>
                Manage savings
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="bottom-nav">
        <div className="nav-inner">
          <NavLink to="/" end className={navItemClass}>
            <House size={18} strokeWidth={2} />
            <span>Home</span>
          </NavLink>
          <NavLink to="/savings" className={navItemClass}>
            <Target size={18} strokeWidth={2} />
            <span>Savings</span>
          </NavLink>
          <NavLink to="/pay" className={navItemClass}>
            <Send size={18} strokeWidth={2} />
            <span>Pay</span>
          </NavLink>
          <NavLink to="/catch-up" className={navItemClass}>
            <RotateCcw size={18} strokeWidth={2} />
            <span>Catch-up</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
