import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useAdminStore = create((set, get) => ({
  users: [],
  usersTotal: 0,
  analytics: null,
  revenueTrend: [],
  topProviders: null,
  auditLogs: [],
  isLoading: false,

  fetchUsers: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/admin-api/users', { params })
      set({ users: res.data.users, usersTotal: res.data.total })
      return res.data.users
    } finally {
      set({ isLoading: false })
    }
  },
  createStaff: async (payload) => {
    const res = await axiosInstance.post('/admin-api/users', payload)
    set({ users: [res.data.user, ...get().users] })
    return res.data // { user, tempPassword }
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
  fetchRevenueTrend: async (months = 6) => {
    const res = await axiosInstance.get('/admin-api/analytics/revenue-trend', { params: { months } })
    set({ revenueTrend: res.data.trend })
    return res.data.trend
  },
  fetchTopProviders: async () => {
    const res = await axiosInstance.get('/admin-api/analytics/top-providers')
    set({ topProviders: res.data })
    return res.data
  },
  fetchAuditLogs: async (params = {}) => {
    const res = await axiosInstance.get('/admin-api/audit-logs', { params })
    set({ auditLogs: res.data.logs })
    return res.data.logs
  },
}))
