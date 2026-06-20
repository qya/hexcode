import { useState } from 'react';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router';
import { BookOpen, Hexagon, ScanLine } from 'lucide-react';
import { HexCodeDocs } from './components/HexCodeDocs';
import { HexCodeGenerator } from './components/HexCodeGenerator';
import { HexCodeScanner } from './components/HexCodeScanner';
import type { CellLevel, ECLevel } from './core/types';

const NAV_ITEMS = [
  { path: '/', label: 'Generator', icon: Hexagon, section: 'Tools', end: true },
  { path: '/decode', label: 'Decoder', icon: ScanLine, section: 'Tools' },
  { path: '/docs', label: 'Docs', icon: BookOpen, section: 'Reference' }
] as const;

type NavItem = (typeof NAV_ITEMS)[number] & { end?: boolean };

export default function App() {
  const [text, setText] = useState('https://example.com/code');
  const [level, setLevel] = useState<CellLevel>(8);
  const [ecLevel, setEcLevel] = useState<ECLevel>('M');

  const sections = NAV_ITEMS.reduce(
    (acc, item) => {
      (acc[item.section] ??= []).push(item);
      return acc;
    },
    {} as Record<string, NavItem[]>
  );

  return (
    <BrowserRouter>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <div className="brand-mark">
                <Hexagon size={18} color="white" strokeWidth={2.5} />
              </div>
              <div>
                <h1 className="brand-title">⬡code</h1>
                <p className="brand-subtitle">Hexagonal code lab</p>
              </div>
            </div>
          </div>

          <nav className="sidebar-nav" aria-label="Primary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2xl)' }}>
              {Object.entries(sections).map(([section, items]) => (
                <div key={section}>
                  <div className="nav-section-label">{section}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.path}
                          to={item.path}
                          end={item.end ?? false}
                          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                        >
                          <Icon className="nav-icon" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="sidebar-footer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="sidebar-footnote">Rust/WASM ready</span>
              <span className="badge badge-muted">v2</span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <HexCodeGenerator
                  text={text}
                  setText={setText}
                  level={level}
                  setLevel={setLevel}
                  ecLevel={ecLevel}
                  setEcLevel={setEcLevel}
                />
              }
            />
            <Route path="/decode" element={<HexCodeScanner />} />
            <Route path="/docs" element={<HexCodeDocs />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
