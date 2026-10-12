// frontend/src/pages/staff/MonthlyReportModal.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import {
  Modal,
  TableWrap,
  DataState,
  errorMessage,
} from '../../components/ui';

export default function MonthlyReportModal({
  open,
  onClose,
  branches = [],
  departments = [],
  isManager = false,
  managerBranchId = null,
}) {
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedBranch, setSelectedBranch] = useState(
    isManager && managerBranchId ? String(managerBranchId) : ''
  );
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [search, setSearch] = useState('');

  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMonthlyReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('month', selectedMonth);
      if (selectedBranch) params.append('branch_id', selectedBranch);
      if (selectedDepartment) params.append('department', selectedDepartment);

      const res = await api.get(`/attendance/monthly-report?${params.toString()}`);
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setReportData(list);
    } catch (err) {
      setError(errorMessage(err, 'Failed to generate monthly attendance report.'));
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, selectedBranch, selectedDepartment]);

  useEffect(() => {
    if (open) {
      fetchMonthlyReport();
    }
  }, [open, fetchMonthlyReport]);

  // Client-side search filtering
  const filteredData = useMemo(() => {
    if (!search.trim()) return reportData;
    const q = search.toLowerCase();
    return reportData.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.employee_id?.toLowerCase().includes(q) ||
        r.department?.toLowerCase().includes(q)
    );
  }, [reportData, search]);

  // Totals aggregation
  const totals = useMemo(() => {
    const acc = {
      present_days: 0,
      absent_days: 0,
      half_days: 0,
      on_leave_days: 0,
      weekly_offs: 0,
      holidays: 0,
      late_days: 0,
      total_working_hours: 0,
    };
    filteredData.forEach((r) => {
      acc.present_days += r.present_days || 0;
      acc.absent_days += r.absent_days || 0;
      acc.half_days += r.half_days || 0;
      acc.on_leave_days += r.on_leave_days || 0;
      acc.weekly_offs += r.weekly_offs || 0;
      acc.holidays += r.holidays || 0;
      acc.late_days += r.late_days || 0;
      acc.total_working_hours += r.total_working_hours || 0;
    });
    return acc;
  }, [filteredData]);

  // Export to CSV function
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      toast.warn('No report data to export.');
      return;
    }

    const headers = [
      'Employee ID',
      'Name',
      'Department',
      'Designation',
      'Branch',
      'Present Days',
      'Absent Days',
      'Half Days',
      'On Leave Days',
      'Weekly Offs',
      'Holidays',
      'Late Days',
      'Total Working Hours',
    ];

    const rows = filteredData.map((r) => [
      `"${r.employee_id || ''}"`,
      `"${r.name || ''}"`,
      `"${r.department || ''}"`,
      `"${r.designation || ''}"`,
      `"${r.branch_name || ''}"`,
      r.present_days || 0,
      r.absent_days || 0,
      r.half_days || 0,
      r.on_leave_days || 0,
      r.weekly_offs || 0,
      r.holidays || 0,
      r.late_days || 0,
      (r.total_working_hours || 0).toFixed(2),
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `monthly_attendance_report_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Attendance report exported to CSV successfully.');
  };

  return (
    <Modal
      open={open}
      title="Monthly Attendance Summary & Audit Report"
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <button
            type="button"
            className="btn btn-gold"
            onClick={handleExportCSV}
            disabled={filteredData.length === 0}
          >
            📥 Export to CSV
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div>
        {/* Report Controls */}
        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            padding: '12px 14px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 150 }}>
            <label style={{ fontSize: 11.5 }}>Select Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>

          <div style={{ minWidth: 160 }}>
            <label style={{ fontSize: 11.5 }}>Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              disabled={isManager}
            >
              <option value="">{isManager ? 'My Branch' : 'All Branches'}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 160 }}>
            <label style={{ fontSize: 11.5 }}>Department</label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 11.5 }}>Filter Employee</label>
            <input
              type="search"
              placeholder="Search by name or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchMonthlyReport}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Report Table */}
        <DataState
          loading={loading}
          error={error}
          empty={filteredData.length === 0}
          emptyProps={{
            title: 'No attendance records in selected month',
            text: 'There are no attendance records logged for the chosen criteria.',
          }}
          onRetry={fetchMonthlyReport}
        >
          <TableWrap>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Branch</th>
                  <th className="num">Present</th>
                  <th className="num">Absent</th>
                  <th className="num">Half Day</th>
                  <th className="num">Leave</th>
                  <th className="num">Weekly Off</th>
                  <th className="num">Holiday</th>
                  <th className="num">Late Days</th>
                  <th className="num">Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.staff_id}>
                    <td>
                      <div className="cell-title">{row.name}</div>
                      <div className="cell-sub">{row.employee_id}</div>
                    </td>
                    <td>{row.department}</td>
                    <td>{row.branch_name}</td>
                    <td className="num">
                      <strong style={{ color: 'var(--success)' }}>{row.present_days}</strong>
                    </td>
                    <td className="num">
                      {row.absent_days > 0 ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{row.absent_days}</span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="num">{row.half_days}</td>
                    <td className="num">{row.on_leave_days}</td>
                    <td className="num">{row.weekly_offs}</td>
                    <td className="num">{row.holidays}</td>
                    <td className="num">
                      {row.late_days > 0 ? (
                        <span className="badge yellow" style={{ padding: '1px 6px', fontSize: 11 }}>
                          {row.late_days}d
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td className="num">
                      <strong>{(row.total_working_hours || 0).toFixed(1)}h</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--surface-2)', fontWeight: 600 }}>
                  <td colSpan={3}>
                    Totals ({filteredData.length} Staff Members)
                  </td>
                  <td className="num" style={{ color: 'var(--success)' }}>{totals.present_days}</td>
                  <td className="num" style={{ color: 'var(--danger)' }}>{totals.absent_days}</td>
                  <td className="num">{totals.half_days}</td>
                  <td className="num">{totals.on_leave_days}</td>
                  <td className="num">{totals.weekly_offs}</td>
                  <td className="num">{totals.holidays}</td>
                  <td className="num" style={{ color: 'var(--warning-text)' }}>{totals.late_days}</td>
                  <td className="num">{totals.total_working_hours.toFixed(1)}h</td>
                </tr>
              </tfoot>
            </table>
          </TableWrap>
        </DataState>
      </div>
    </Modal>
  );
}
