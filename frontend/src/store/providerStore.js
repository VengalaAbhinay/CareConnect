import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useProviderStore = create((set, get) => ({
  myProfile: null,
  myStats: null,
  providers: [],
  activeProvider: null,
  providerReviews: [],
  dayAvailability: null,
  isLoading: false,

  fetchMyProfile: async () => {
    const res = await axiosInstance.get('/provider-api/profile/me')
    set({ myProfile: res.data.profile })
    return res.data.profile
  },
  fetchMyStats: async () => {
    const res = await axiosInstance.get('/provider-api/stats/me')
    set({ myStats: res.data })
    return res.data
  },
  saveMyProfile: async (payload) => {
    const res = await axiosInstance.post('/provider-api/profile', payload)
    set({ myProfile: res.data.profile })
    return res.data.profile
  },
  addAvailability: async (slot) => {
    const res = await axiosInstance.post('/provider-api/availability', slot)
    set({ myProfile: res.data.profile })
    return res.data.profile
  },
  updateAvailability: async (slotId, slot) => {
    const res = await axiosInstance.put(`/provider-api/availability/${slotId}`, slot)
    set({ myProfile: res.data.profile })
    return res.data.profile
  },
  removeAvailability: async (slotId) => {
    const res = await axiosInstance.delete(`/provider-api/availability/${slotId}`)
    set({ myProfile: res.data.profile })
    return res.data.profile
  },

  fetchProviders: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/provider-api', { params })
      set({ providers: res.data.providers })
      return res.data.providers
    } finally {
      set({ isLoading: false })
    }
  },
  fetchProvider: async (id) => {
    const res = await axiosInstance.get(`/provider-api/${id}`)
    set({ activeProvider: res.data.profile })
    return res.data.profile
  },
  fetchProviderReviews: async (id) => {
    const res = await axiosInstance.get(`/provider-api/${id}/reviews`)
    set({ providerReviews: res.data.reviews })
    return res.data.reviews
  },
  fetchDayAvailability: async (id, params = {}) => {
    const res = await axiosInstance.get(`/provider-api/${id}/availability`, { params })
    set({ dayAvailability: res.data })
    return res.data
  },
  verifyProvider: async (id, verificationStatus, note) => {
    const res = await axiosInstance.put(`/provider-api/${id}/verify`, { verificationStatus, note })
    set({ providers: get().providers.map((p) => (p._id === id ? res.data.profile : p)) })
    return res.data.profile
  },
}))
