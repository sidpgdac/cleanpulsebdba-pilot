import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { initials } from '../lib/data.js';

export default function Users({ facilityId, notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!facilityId) return;
    setLoading(true);
    api(`/api/admin/users?facilityId=${facilityId}`)
      .then(r => setUsers(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [facilityId]);

  return (
    <section className="page-stack">
      <div className="page-title">
        <div>
          <p>PEOPLE / USERS</p>
          <h1>Facility users</h1>
          <span>Manage dashboard access for administrators and supervisors.</span>
        </div>
        <div className="page-actions">
          <button className="primary" onClick={() => notify('Add user coming soon')}>＋ Invite user</button>
        </div>
      </div>

      <section className="master-table panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>User</th><th>Role</th><th>Status</th><th>Last active</th><th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 10 }}>Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)', fontSize: 10 }}>No users found.</td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="user-cell">
                      <span>{initials(u.full_name)}</span>
                      <div><b>{u.full_name}</b></div>
                    </div>
                  </td>
                  <td><span className="role-pill">{u.role}</span></td>
                  <td><span className="green-text">● Active</span></td>
                  <td><b className="mono-id">Just now</b></td>
                  <td><button className="row-menu" onClick={() => notify('User options opened')}>•••</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
