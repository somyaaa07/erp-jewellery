// src/pages/Admin/BranchManagement.jsx
import React, { useEffect, useState } from "react";
import { toast } from "react-toastify";
import api from "../../api/axios";

export default function BranchManagement() {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ name: "", address: "", gstin: "" });
  const [submitting, setSubmitting] = useState(false);

  const load = () => api.get("/branches").then((res) => setBranches(res.data));
  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/branches", form);
      setForm({ name: "", address: "", gstin: "" });
      toast.success("Branch added successfully");
      load();
    } catch (err) {
      toast.error(
        err.response?.data?.error ||
          "Could not create branch. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Branches</h1>
      <form className="card" onSubmit={handleCreate}>
        <h3 style={{ marginBottom: 12 }}>Add Branch</h3>
        <div className="form-group">
          <label>Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="form-group">
          <label>Address</label>
          <input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>GSTIN</label>
          <input
            value={form.gstin}
            onChange={(e) => setForm({ ...form, gstin: e.target.value })}
          />
        </div>
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Adding…" : "Add Branch"}
        </button>
      </form>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>GSTIN</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td>{b.address}</td>
                <td>{b.gstin}</td>
                <td>
                  <span className={`badge ${b.is_active ? "green" : "red"}`}>
                    {b.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
