// src/hooks/useBranchScope.jsx
// Admins can see every branch, so they pick one; managers and staff are already tied to a
// branch by the server. `params` is what to attach to API calls, `ready` says whether the
// screen can load yet.
import React, { useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function useBranchScope() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    api.get('/branches')
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setBranches(list);
        if (list.length > 0) setBranchId((current) => current || String(list[0].id));
      })
      .catch(() => setBranches([]));
  }, [isAdmin]);

  return {
    isAdmin,
    branches,
    branchId,
    setBranchId,
    ready: !isAdmin || Boolean(branchId),
    params: isAdmin ? { branch_id: branchId } : {},
  };
}

export function BranchPicker({ scope }) {
  if (!scope.isAdmin) return null;
  return (
    <div className="form-group" style={{ minWidth: 200, marginBottom: 0 }}>
      <label>Branch</label>
      <select value={scope.branchId} onChange={(e) => scope.setBranchId(e.target.value)}>
        {scope.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </div>
  );
}
