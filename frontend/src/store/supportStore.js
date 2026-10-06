import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useSupportStore = create((set, get) => ({
  cases: [],
  activeCase: null,
  activeCaseInvoice: null,
  stats: null,
  isLoading: false,

  fetchCases: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/support-api/cases', { params })
      set({ cases: res.data.cases })
      return res.data.cases
    } finally {
      set({ isLoading: false })
    }
  },
  fetchCase: async (id) => {
    const res = await axiosInstance.get(`/support-api/cases/${id}`)
    set({ activeCase: res.data.case, activeCaseInvoice: res.data.invoice })
    return res.data.case
  },
  fetchStats: async () => {
    const res = await axiosInstance.get('/support-api/stats')
    set({ stats: res.data })
    return res.data
  },
  raiseCase: async (payload) => {
    const res = await axiosInstance.post('/support-api/cases', payload)
    set({ cases: [res.data.case, ...get().cases] })
    return res.data.case
  },
  sendMessage: async (id, payload) => {
    const res = await axiosInstance.post(`/support-api/cases/${id}/messages`, payload)
    set({ activeCase: res.data.case })
    return res.data.case
  },
  assignCase: async (id, assignedTo) => {
    const res = await axiosInstance.put(`/support-api/cases/${id}/assign`, { assignedTo })
    set({ activeCase: res.data.case })
    return res.data.case
  },
  escalateCase: async (id, note) => {
    const res = await axiosInstance.put(`/support-api/cases/${id}/escalate`, { note })
    set({ activeCase: res.data.case })
    return res.data.case
  },
  updateCase: async (id, payload) => {
    const res = await axiosInstance.put(`/support-api/cases/${id}`, payload)
    set({ activeCase: res.data.case })
    return res.data.case
  },
}))
