import { create } from 'zustand'
import axiosInstance from '../api/axiosInstance.js'

export const useInvoiceStore = create((set, get) => ({
  invoices: [],
  activeInvoice: null,
  isLoading: false,

  fetchInvoices: async (params = {}) => {
    set({ isLoading: true })
    try {
      const res = await axiosInstance.get('/invoice-api', { params })
      set({ invoices: res.data.invoices })
      return res.data.invoices
    } finally {
      set({ isLoading: false })
    }
  },
  fetchInvoice: async (id) => {
    const res = await axiosInstance.get(`/invoice-api/${id}`)
    set({ activeInvoice: res.data.invoice })
    return res.data.invoice
  },
  createInvoice: async (bookingId) => {
    const res = await axiosInstance.post('/invoice-api', { bookingId })
    set({ invoices: [res.data.invoice, ...get().invoices] })
    return res.data.invoice
  },
  saveInvoice: async (id, payload) => {
    const res = await axiosInstance.put(`/invoice-api/${id}`, payload)
    set({ activeInvoice: res.data.invoice })
    return res.data.invoice
  },
  issueInvoice: async (id) => {
    const res = await axiosInstance.put(`/invoice-api/${id}/issue`)
    set({ activeInvoice: res.data.invoice })
    return res.data.invoice
  },
  payInvoice: async (id, method) => {
    const res = await axiosInstance.put(`/invoice-api/${id}/pay`, { method })
    set({ activeInvoice: res.data.invoice })
    return res.data.invoice
  },
  voidInvoice: async (id) => {
    const res = await axiosInstance.put(`/invoice-api/${id}/void`)
    set({ activeInvoice: res.data.invoice })
    return res.data.invoice
  },
  deleteInvoice: async (id) => {
    await axiosInstance.delete(`/invoice-api/${id}`)
    set({ invoices: get().invoices.filter((i) => i._id !== id) })
  },
}))
