import { useEffect, useState } from 'react'
import { initializePaddle } from '@paddle/paddle-js'
import type { BillingPrices } from '@repo/data'

type PaddlePricesResult = BillingPrices & { isLoading: boolean }

export function usePaddlePrices(): PaddlePricesResult {
  const [result, setResult] = useState<PaddlePricesResult>({
    monthly: null,
    annual: null,
    currencyCode: 'USD',
    isLoading: true,
  })

  useEffect(() => {
    const monthlyPriceId = import.meta.env.VITE_PADDLE_MONTHLY_PRICE_ID as string | undefined
    const annualPriceId = import.meta.env.VITE_PADDLE_ANNUAL_PRICE_ID as string | undefined
    const token = import.meta.env.VITE_PADDLE_CLIENT as string | undefined
    const environment = (import.meta.env.VITE_PADDLE_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'production'

    if (!monthlyPriceId || !annualPriceId || !token) {
      setResult(r => ({ ...r, isLoading: false }))
      return
    }

    initializePaddle({ environment, token })
      .then(async (paddle) => {
        if (!paddle) {
          setResult(r => ({ ...r, isLoading: false }))
          return
        }

        const preview = await paddle.PricePreview({
          items: [
            { priceId: monthlyPriceId, quantity: 1 },
            { priceId: annualPriceId, quantity: 1 },
          ],
        })

        const { currencyCode, details } = preview.data
        const lineItems = details.lineItems
        const monthlyItem = lineItems.find(i => i.price.id === monthlyPriceId)
        const annualItem = lineItems.find(i => i.price.id === annualPriceId)

        // Paddle totals are in minor currency units (e.g. cents for EUR/USD).
        // Zero-decimal currencies have no subunit, so the divisor is 1.
        const zeroDecimal = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF'])
        const minorUnitDivisor = zeroDecimal.has(currencyCode) ? 1 : 100

        const annualTotalMinor = parseFloat(annualItem?.totals.total ?? '15000')
        const annualMonthlyNum = annualTotalMinor / minorUnitDivisor / 12
        const fmt = new Intl.NumberFormat(navigator.language, {
          style: 'currency',
          currency: currencyCode,
          minimumFractionDigits: zeroDecimal.has(currencyCode) ? 0 : 2,
          maximumFractionDigits: zeroDecimal.has(currencyCode) ? 0 : 2,
        })

        const toMajor = (minorStr: string) =>
          (parseFloat(minorStr) / minorUnitDivisor).toFixed(zeroDecimal.has(currencyCode) ? 0 : 2)

        setResult({
          currencyCode,
          isLoading: false,
          monthly: monthlyItem
            ? {
                total: toMajor(monthlyItem.totals.total),
                formatted: monthlyItem.formattedTotals.total,
              }
            : null,
          annual: annualItem
            ? {
                total: toMajor(annualItem.totals.total),
                formatted: annualItem.formattedTotals.total,
                monthlyFormatted: fmt.format(annualMonthlyNum),
              }
            : null,
        })
      })
      .catch(() => setResult(r => ({ ...r, isLoading: false })))
  }, [])

  return result
}
