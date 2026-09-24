import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useProviderStore = create((set, get) => ({
  myProfile: null,
  providers: [],
  isLoading: false,

  fetchMyProfile: async () => {
    const res = await axiosInstance.get('/provider-api/profile/me')
    set({ myProfile: res.data.profile })
    return res.data.profile
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
  removeAvailability: async (index) => {
    const res = await axiosInstance.delete(`/provider-api/availability/${index}`)
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
  verifyProvider: async (id, verificationStatus) => {
    const res = await axiosInstance.put(`/provider-api/${id}/verify`, { verificationStatus })
    set({ providers: get().providers.map((p) => (p._id === id ? res.data.profile : p)) })
    return res.data.profile
  },
}))
