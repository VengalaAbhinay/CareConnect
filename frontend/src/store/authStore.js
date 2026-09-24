import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useAuthStore = create((set) => ({
  user: null,
  isLoading: true,

  fetchCurrentUser: async () => {
    try {
      const res = await axiosInstance.get('/user-api/me')
      set({ user: res.data.user, isLoading: false })
    } catch {
      set({ user: null, isLoading: false })
    }
  },

  login: async (credentials) => {
    const res = await axiosInstance.post('/user-api/login', credentials)
    set({ user: res.data.user })
    return res.data.user
  },

  register: async (payload) => {
    const res = await axiosInstance.post('/user-api/register', payload)
    set({ user: res.data.user })
    return res.data.user
  },

  logout: async () => {
    await axiosInstance.post('/user-api/logout')
    set({ user: null })
  }
}))
