import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useServiceStore = create((set, get) => ({
  categories: [],
  requests: [],
  activeRequest: null,
  quotesForActiveRequest: [],
  myQuotes: [],
  suggestedProviders: [],
  isLoading: false,

  /* ---------- categories ---------- */
  fetchCategories: async (params = {}) => {
    const res = await axiosInstance.get('/service-api/categories', { params })
    set({ categories: res.data.categories })
    return res.data.categories
  },
  createCategory: async (payload) => {
    const res = await axiosInstance.post('/service-api/categories', payload)
    set({ categories: [...get().categories, res.data.category] })
    return res.data.category
  },
  updateCategory: async (id, payload) => {
    const res = await axiosInstance.put(`/service-api/categories/${id}`, payload)
    set({ categories: get().categories.map((c) => (c._id === id ? res.data.category : c)) })
    return res.data.category
  },
  deactivateCategory: async (id) => {
    const res = await axiosInstance.delete(`/service-api/categories/${id}`)
    set({ categories: get().categories.map((c) => (c._id === id ? res.data.category : c)) })
    return res.data.category
  },

  /* ---------- requests ---------- */
  fetchRequests: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/service-api/requests', { params })
      set({ requests: res.data.requests })
      return res.data.requests
    } finally {
      set({ isLoading: false })
    }
  },
  fetchRequest: async (id) => {
    const res = await axiosInstance.get(`/service-api/requests/${id}`)
    set({ activeRequest: res.data.request })
    return res.data.request
  },
  createRequest: async (payload) => {
    const res = await axiosInstance.post('/service-api/requests', payload)
    set({ requests: [res.data.request, ...get().requests] })
    return res.data.request
  },
  cancelRequest: async (id) => {
    const res = await axiosInstance.put(`/service-api/requests/${id}/cancel`)
    set({ requests: get().requests.map((r) => (r._id === id ? res.data.request : r)) })
    return res.data.request
  },
  classify: async (description, requestId) => {
    const res = await axiosInstance.post('/service-api/classify', { description, requestId })
    return res.data.classification
  },
  fetchSuggestedProviders: async (requestId) => {
    const res = await axiosInstance.get(`/service-api/requests/${requestId}/suggested-providers`)
    set({ suggestedProviders: res.data.suggestions })
    return res.data.suggestions
  },

  /* ---------- quotes ---------- */
  fetchQuotesForRequest: async (requestId) => {
    const res = await axiosInstance.get(`/service-api/requests/${requestId}/quotes`)
    set({ quotesForActiveRequest: res.data.quotes })
    return res.data.quotes
  },
  submitQuote: async (payload) => {
    const res = await axiosInstance.post('/service-api/quotes', payload)
    return res.data.quote
  },
  fetchMyQuotes: async (params = {}) => {
    const res = await axiosInstance.get('/service-api/quotes/mine', { params })
    set({ myQuotes: res.data.quotes })
    return res.data.quotes
  },
  withdrawQuote: async (id) => {
    const res = await axiosInstance.put(`/service-api/quotes/${id}/withdraw`)
    set({ myQuotes: get().myQuotes.map((q) => (q._id === id ? res.data.quote : q)) })
    return res.data.quote
  },
}))
