import React from 'react'
import wilson from 'wilson-score-interval'
import { expandLineage, topologise } from 'pango-utils'
import useAPI from '../api'

export const indexMapResults = (index, results, key, valueKey = 'sum') => {
  for (const row of results) {
    const { area, date, [valueKey]: value } = row
    if (area in index) {
      const dates = index[area]
      if (date in dates) {
        dates[date][key] = value
      } else {
        dates[date] = { [key]: value }
      }
    } else {
      index[area] = { [date]: { [key]: value } }
    }
  }
}

export const createMapArrays = ({ index, dates, areas, confidence, avg }) => {
  const values = { counts: [], mean: [], lower: [], upper: [] }
  for (const area of areas) {
    const counts = []
    const mean = []
    const lower = []
    const upper = []
    for (const date of dates) {
      if (!(area in index) || !(date in index[area])) {
        counts.push(0)
        mean.push(null)
        lower.push(null)
        upper.push(null)
        continue
      }
      const { total = 0, value } = index[area][date]
      const count = value || 0
      counts.push(count)
      if (total > 0) {
        const [left = null, right = null] = count !== null ? confidence(count, total) : []
        mean.push(count / total)
        lower.push(left)
        upper.push(right)
      } else {
        mean.push(avg(count))
        lower.push(null)
        upper.push(null)
      }
    }
    values.counts.push(counts)
    values.mean.push(mean)
    values.lower.push(lower)
    values.upper.push(upper)
  }
  return values
}

export const defaultConfidence = (count, total) => {
  const { left, right } = wilson(count, total)
  return [Math.abs(left), Math.min(Math.abs(right), 1)]
}

const defaultAvg = count => count / 2

const queryStringify = query => new URLSearchParams(query).toString()

export default ({ api_url, lineages, info, confidence = defaultConfidence, avg = defaultAvg }) => {
  const [unaliasedToAliased, topology] = React.useMemo(() => {
    const memo = {}
    for (const l of lineages) {
      const expanded = expandLineage(l)
      memo[expanded] = l
    }
    return [memo, topologise(Object.keys(memo))]
  }, [lineages])

  const cachedTotals = React.useRef({ key: null, value: [] })

  const impl = React.useMemo(() => ({
    async fetchChartData (area) {
      const query = new URLSearchParams({
        lineages: Object.keys(unaliasedToAliased).sort()
      })
      if (area !== 'overview') {
        query.append('area', area)
      }
      const response = await fetch(`${api_url}/frequency?${query.toString()}`)
      const json = await response.json()

      const lineageZeroes = Object.fromEntries(lineages.map(l => [l, 0]))
      const index = Object.fromEntries(info.dates.map(d => [d, { ...lineageZeroes, total: 0 }]))

      for (const { date, key, period_count: count } of json) {
        if (date in index) {
          index[date][key] = count
          index[date].total += count
        }
      }

      const data = []
      for (const [date, counts] of Object.entries(index)) {
        for (const [key, count] of Object.entries(counts)) {
          if (key === 'total') continue

          const metadata = { date, location: area, lineage: unaliasedToAliased[key] || key }
          const [left, right] = confidence(count, counts.total)
          data.push(
            { ...metadata, parameter: 'lambda', count, mean: avg(count), lower: null, upper: null },
            { ...metadata, parameter: 'p', mean: count / counts.total, lower: Math.abs(left), upper: Math.abs(right) }
          )
        }
      }
      return data
    },
    async fetchMapData (aliased, parameter) {
      const lineage = expandLineage(aliased)
      const useCachedTotals = parameter !== 'p' || cachedTotals.current.key === lineages
      const [totalJson, lineageJson] = await Promise.all([
        useCachedTotals
          ? Promise.resolve(cachedTotals.current.value)
          : fetch(`${api_url}/spatiotemporal/total?${queryStringify({ lineages: topology.map(_ => _.name).sort() })}`)
            .then(_ => _.json()),
        fetch(`${api_url}/spatiotemporal/lineage?${queryStringify({
          lineage,
          excluding: Object.keys(unaliasedToAliased).filter(l => l.startsWith(`${lineage}.`)).sort()
        })}`).then(_ => _.json())
      ])
      if (!useCachedTotals) {
        cachedTotals.current = { key: lineages, value: totalJson }
      }
      const index = {}
      indexMapResults(index, totalJson, 'total')
      indexMapResults(index, lineageJson, 'value')

      const uniqueDates = info.dates
      const uniqueAreas = info.areas
      const values = createMapArrays({
        areas: uniqueAreas,
        avg,
        confidence,
        dates: uniqueDates,
        index
      })

      return {
        dates: uniqueDates,
        areas: uniqueAreas,
        values
      }
    }
  }), [unaliasedToAliased])

  return useAPI(null, impl)
}
