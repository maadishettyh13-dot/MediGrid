/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { User } from './types/medilink';
import { useMediLinkSocket } from './hooks/useMediLinkSocket';
import { Layout, NavPage } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { ControlRoomPage } from './pages/ControlRoomPage';
import { HospitalConsolePage } from './pages/HospitalConsolePage';
import { AmbulanceDispatchPage } from './pages/AmbulanceDispatchPage';
import { TransfersPage } from './pages/TransfersPage';

function defaultPageForRole(role: User['role']): NavPage {
  if (role === 'HOSPITAL_STAFF') return 'hospital-console';
  if (role === 'AMBULANCE_DISPATCHER') return 'ambulance-dispatch';
  return 'control-room';
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [activePage, setActivePage] = useState<NavPage>('control-room');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('HOSP-01');

  const {
    snapshot,
    loading,
    error,
    notifications,
    dismissNotification,
    refreshSnapshot,
  } = useMediLinkSocket(Boolean(user));

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setActivePage(defaultPageForRole(loggedInUser.role));
    if (loggedInUser.hospital_id) {
      setSelectedHospitalId(loggedInUser.hospital_id);
    }
  };

  const handleLogout = () => {
    setUser(null);
  };

  const handleInspectHospital = (hospitalId: string) => {
    setSelectedHospitalId(hospitalId);
    if (user?.role === 'CONTROL_ROOM' || user?.role === 'HOSPITAL_STAFF') {
      setActivePage('hospital-console');
    }
  };

  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Layout
      user={user}
      activePage={activePage}
      onNavigate={setActivePage}
      onLogout={handleLogout}
      notifications={notifications}
      onDismissNotification={dismissNotification}
    >
      {loading && !snapshot ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-28 rounded-xl bg-[#FFFEFA] border border-[#E7DED2]" />
          ))}
        </div>
      ) : error && !snapshot ? (
        <div className="bg-[#FFFEFA] border border-[#DEC4C8] rounded-xl p-6 text-center space-y-3">
          <div className="text-sm font-bold text-[#702C3B]">Unable to load MediGrid operational snapshot</div>
          <p className="text-xs text-[#77716D]">{error}</p>
          <button
            type="button"
            onClick={() => void refreshSnapshot()}
            className="px-4 py-2 rounded-lg bg-[#702C3B] text-[#FFFDF8] text-xs font-semibold"
          >
            Retry Connection
          </button>
        </div>
      ) : snapshot ? (
        <>
          {activePage === 'control-room' && (
            <ControlRoomPage snapshot={snapshot} onInspectHospital={handleInspectHospital} />
          )}
          {activePage === 'hospital-console' && (
            <HospitalConsolePage
              snapshot={snapshot}
              user={user}
              selectedHospitalId={selectedHospitalId}
              onSelectHospital={setSelectedHospitalId}
              onRefresh={() => void refreshSnapshot()}
              onNavigateTransfers={() => setActivePage('transfers')}
            />
          )}
          {activePage === 'ambulance-dispatch' && (
            <AmbulanceDispatchPage
              snapshot={snapshot}
              user={user}
              onRefresh={() => void refreshSnapshot()}
              onNavigateTransfers={() => setActivePage('transfers')}
            />
          )}
          {activePage === 'transfers' && (
            <TransfersPage snapshot={snapshot} user={user} onRefresh={() => void refreshSnapshot()} />
          )}
        </>
      ) : null}
    </Layout>
  );
}
