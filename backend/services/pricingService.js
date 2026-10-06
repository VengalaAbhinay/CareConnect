import { money } from '../utils/helpers.js'

// Returns an error message if the quote violates the category's pricing policy, otherwise null.
export function checkQuotePrice(category, price) {
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return 'Enter a valid price greater than zero'
  const min = category?.basePriceRange?.min || 0
  const max = category?.basePriceRange?.max || 0
  if (category?.enforcePriceRange && max > 0 && (p < min || p > max)) {
    return `Quotes for ${category.name} must be between ₹${min} and ₹${max} (platform pricing policy)`
  }
  return null
}

// line items -> totals, applying the category's fee/tax policy.
export function computeTotals(lineItems, category) {
  const items = (lineItems || []).map((li) => {
    const quantity = Number(li.quantity) > 0 ? Number(li.quantity) : 1
    const unitPrice = Math.max(0, Number(li.unitPrice) || 0)
    return { description: String(li.description || '').trim(), quantity, unitPrice, amount: money(quantity * unitPrice) }
  })
  const subtotal = money(items.reduce((n, li) => n + li.amount, 0))
  const taxPercent = category?.taxPercent ?? 0
  const platformFeePercent = category?.platformFeePercent ?? 10
  const tax = money((subtotal * taxPercent) / 100)
  const platformFee = money((subtotal * platformFeePercent) / 100)
  return {
    lineItems: items, subtotal, taxPercent, tax, total: money(subtotal + tax),
    platformFeePercent, platformFee, providerPayout: money(subtotal - platformFee),
  }
}
