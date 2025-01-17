import { useReducer, useEffect, useCallback, useMemo } from 'react'

import LineageTree from '../components/LineageTree'
import LineageTreeWithMutations from '../components/LineageTreeWithMutations'

import { buildFullTopology, whoVariants, expandLineage } from '../pango'
import useReverseAliasLookup from './useReverseAliasLookup'

const whoVariantsOrder = Object.keys(whoVariants)

const fetchLineages = async (api_url, { area = '', fromDate = '', toDate = '' } = {}) => {
  const response = await fetch(`${api_url}/lineages?area=${area}&from=${fromDate}&to=${toDate}`)
  return response.json()
}

const sortByCladeSize = (a, b) => {
  if (b.sumOfClade + b.sum > a.sumOfClade + a.sum) return 1
  if (b.sumOfClade + b.sum < a.sumOfClade + a.sum) return -1
  return 0
}

const constructLineage = (name, toAlias) => {
  let remaining = name
  while (remaining.includes('.')) {
    remaining = remaining.slice(0, remaining.lastIndexOf('.'))
    if (remaining in toAlias) {
      return name.replace(remaining, toAlias[remaining])
    }
  }
  return name
}

const createNodeWithState = (node, state, parentWhos = []) => {
  const { nodeIndex, preset, selectedLineages } = state
  const {
    lineage = constructLineage(node.name, state.toAlias),
    sum = 0,
    selected = selectedLineages.includes(lineage)
  } = nodeIndex[node.name] || {}
  const alias = state.toAlias[node.name]
  const who = whoVariants[node.name]
  const nextParentWhos = who ? [...parentWhos, who] : parentWhos

  let childrenWithState = []
  for (const child of node.children) {
    const newNodes = createNodeWithState(child, state, nextParentWhos)
    childrenWithState = childrenWithState.concat(newNodes)
  }
  childrenWithState.sort(sortByCladeSize)

  if (preset === 'who' && nextParentWhos.length === 0) {
    return childrenWithState
  }

  let sumOfClade = 0
  let childIsSelected = selectedLineages.some(l => l.startsWith(`${lineage}+`))
  for (const child of childrenWithState) {
    sumOfClade += child.sumOfClade + child.sum
    childIsSelected = childIsSelected || child.childIsSelected || child.selected
  }

  return [{
    altName: who || alias,
    childIsSelected,
    children: preset === 'selected' && (selected && !childIsSelected) ? [] : childrenWithState,
    lineage,
    name: node.name,
    searchText: [node.name, ...nextParentWhos].join('|').toLowerCase(),
    selected,
    sum,
    sumOfClade
  }]
}

const mapStateToNodes = (nodes, state) => {
  let _nodes = []
  for (const node of nodes) {
    _nodes = _nodes.concat(createNodeWithState(node, state))
  }
  if (state.preset === 'who') {
    return _nodes.sort((a, b) => {
      if (whoVariantsOrder.indexOf(a.name) > whoVariantsOrder.indexOf(b.name)) return 1
      if (whoVariantsOrder.indexOf(a.name) < whoVariantsOrder.indexOf(b.name)) return -1
      return 0
    })
  }
  return _nodes
}

export default ({
  api_url,
  colourPalette,
  preset,
  lineageToColourIndex,
  mutationMode,
  queryParams,
  search,
  setPreset,
  setSearch,
  showLineageView
}) => {
  const [state, dispatch] = useReducer((state, action) => {
    switch (action.type) {
      case 'QUEUE_REFETCH':
        return { ...state, loadedProps: null }
      case 'LOADING':
        return { ...state, loading: action.payload.props }
      case 'FETCHED': {
        const { props, index } = action.payload
        if (Object.entries(state.loading).some(([k, v]) => props[k] !== v)) {
          return state
        }
        return {
          ...state,
          nodeIndex: index,
          loading: null,
          loadedProps: action.payload.props,
          topology: buildFullTopology(Object.keys(index))
        }
      }
      case 'ERROR': {
        throw action.payload
      }
      case 'TOGGLE_OPEN': {
        const { nodeName, isOpen } = action.payload
        return {
          ...state,
          nodeIndex: {
            ...state.nodeIndex,
            [nodeName]: {
              ...state.nodeIndex[nodeName],
              isOpen: !isOpen
            }
          }
        }
      }
      case 'SCROLL_POSITION':
        return { ...state, scrollPosition: action.payload }
      default:
        return state
    }
  }, {
    loadedProps: null,
    nodeIndex: null,
    topology: [],
    scrollPosition: null
  })

  const { loadedProps } = state

  useEffect(() => {
    if (showLineageView && loadedProps !== queryParams) {
      dispatch({ type: 'QUEUE_REFETCH' })
    }
  }, [showLineageView])

  useEffect(() => { dispatch({ type: 'QUEUE_REFETCH' }) }, [queryParams])

  const toAlias = useReverseAliasLookup()

  useEffect(async () => {
    if (!showLineageView || loadedProps !== null) return
    try {
      const props = queryParams
      dispatch({ type: 'LOADING', payload: { props } })
      let lineageData = await fetchLineages(api_url, props)

      // handle backend v2 response
      if (!Array.isArray(lineageData)) {
        lineageData = Object.entries(lineageData)
          .map(([pango_clade, sum]) => ({
            pango_clade,
            sum
            // lineage: ?
          }))
      }

      const index = Object.fromEntries(
        lineageData.map(l => {
          const expanded = l.pango_clade.slice(0, -1)
          return [
            expanded,
            { ...l, sum: parseInt(l.sum) }
          ]
        })
      )
      dispatch({ type: 'FETCHED', payload: { index, props } })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e })
    }
  }, [showLineageView, loadedProps])

  const toggleOpen = useCallback((nodeName, isOpen) => {
    dispatch({ type: 'TOGGLE_OPEN', payload: { nodeName, isOpen } })
  }, [dispatch])

  const selectedLineages = useMemo(
    () => Object.keys(lineageToColourIndex),
    [lineageToColourIndex]
  )
  const numberSelected = selectedLineages.length

  const topology = useMemo(() => {
    const { topology, ...rest } = state
    return mapStateToNodes(topology, { ...rest, selectedLineages, toAlias, preset })
  }, [state.topology, preset, toAlias])

  const lineageFilterText = useMemo(() => {
    if (search.length) {
      const upper = search.toUpperCase()
      const expanded = expandLineage(upper)
      if (upper !== expanded) return expanded
    }
    return undefined
  }, [search])

  return useMemo(() => ({
    // props
    api_url,
    colourPalette,
    mutationMode,
    queryParams,
    TreeComponent: mutationMode ? LineageTreeWithMutations : LineageTree,

    // state
    ...state,
    isLoading: loadedProps === null,
    lineageFilterText,
    numberSelected,
    preset,
    search,
    topology,

    // actions
    setPreset,
    setScrollPosition: pos => dispatch({ type: 'SCROLL_POSITION', payload: pos }),
    setSearch,
    toggleOpen
  }), [state, numberSelected, topology, colourPalette, search])
}
