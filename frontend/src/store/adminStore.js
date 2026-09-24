import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useAdminStore = create((set, get) => ({
  users: [],
  analytics: null,
  auditLogs: [],
  isLoading: false,

  fetchUsers: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/admin-api/users', { params })
      set({ users: res.data.users })
      return res.data.users
    } finally {
      set({ isLoading: false })
    }
  },
  updateUser: async (id, payload) => {
    const res = await axiosInstance.put(`/admin-api/users/${id}`, payload)
    set({ users: get().users.map((u) => (u._id === id ? res.data.user : u)) })
    return res.data.user
  },
  fetchAnalytics: async () => {
    const res = await axiosInstance.get('/admin-api/analytics/overview')
    set({ analytics: res.data })
    return res.data
  },
  fetchAuditLogs: async (params = {}) => {
    const res = await axiosInstance.get('/admin-api/audit-logs', { params })
    set({ auditLogs: res.data.logs })
    return res.data.logs
  },
}))
