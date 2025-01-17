import 'maplibre-gl/dist/maplibre-gl.css'
import './Chloropleth.css'

import React, { useState, useMemo, useEffect } from 'react'
import classnames from 'classnames'
import * as tailwindColors from 'tailwindcss/colors'
import ReactMapGL, { NavigationControl } from 'react-map-gl'
import Measure from 'react-measure'
import { interpolateMagma } from 'd3-scale-chromatic'

import FadeTransition from './FadeTransition'
import MapPopup from './MapPopup'
import Checkbox from './Checkbox'

import useQueryAsState from '../hooks/useQueryAsState'
import useMediaQuery from '../hooks/useMediaQuery'

// original RGBs left in for reference
const colourStops = [
  { index: 0, rgb: 'rgb(0, 0, 4)' },
  { index: 0.13, rgb: 'rgb(28, 16, 68)' },
  { index: 0.25, rgb: 'rgb(79, 18, 123)' },
  { index: 0.38, rgb: 'rgb(129, 37, 129)' },
  { index: 0.5, rgb: 'rgb(181, 54, 122)' },
  { index: 0.63, rgb: 'rgb(229, 80, 100)' },
  { index: 0.75, rgb: 'rgb(251, 135, 97)' },
  { index: 0.88, rgb: 'rgb(254, 194, 135)' },
  { index: 1, rgb: 'rgb(252, 253, 191)' }
].map(x => {
  const index = (x.index - 0.13) / (1 - 0.13)
  return { index, rgb: interpolateMagma(x.index) }
}).slice(1) // Cut off the first bit of magma with black

const makeMagmaGradient = (transform) => {
  const stops = []
  for (let i = 0; i <= 100; i += 1) {
    const value = transform(i / 100)
    const color = interpolateMagma(value)
    stops.push(`${color} ${i}%`)
  }
  return `linear-gradient(to right, ${stops.join(',')})`
}

const RColourStops = [
  { index: 0.125, rgb: 'rgb(255, 0, 0)' },
  { index: 0.75, rgb: 'rgb(255, 255, 255)' },
  { index: 1, rgb: 'rgb(0, 0, 255)' }
]

const gradients = {
  linear: makeMagmaGradient(v => 1.13 - (v + 0.13) / 1.13),
  quadratic: makeMagmaGradient(v => 1.13 - (Math.sqrt(v) + 0.13) / 1.13),
  R_scale: `linear-gradient(to left, ${RColourStops.map(_ => `${_.rgb} ${_.index * 100}%`).join(',')})`
}

const ColourBar = ({ dmin, dmax, type, percentage, opacity }) => {
  let midpoint
  if (dmax > 2) {
    midpoint = Math.ceil((dmin + dmax) * 0.5)
  } else {
    midpoint = Math.round(10 * (dmin + dmax) * 0.5) / 10
  }

  const gradient = gradients[type]

  const formatValue = useMemo(() =>
    percentage
      ? v => { const _v = v * 100; return `${Number.isInteger(_v) ? _v : _v.toFixed(1)}%` }
      : (v, method = 'round') => Math[method](v).toLocaleString()
  , [percentage])

  return (
    <>
      <div className='h-3 rounded-sm overflow-hidden bg-white'>
        <div className='h-full w-full' style={{ backgroundImage: gradient, opacity }} />
      </div>
      <div className='grid grid-cols-3 text-xs tracking-wide leading-6'>
        <span>
          {formatValue(dmin, 'floor')}
        </span>
        <span className='text-center'>
          {formatValue(midpoint)}
        </span>
        <span className='text-right'>
          {formatValue(dmax, 'ceil')}
        </span>
      </div>
    </>
  )
}

function clampViewport (viewport, bounds) {
  if (viewport.longitude < bounds.min_longitude) {
    viewport.longitude = bounds.min_longitude
  } else if (viewport.longitude > bounds.max_longitude) {
    viewport.longitude = bounds.max_longitude
  }
  if (viewport.latitude < bounds.min_latitude) {
    viewport.latitude = bounds.min_latitude
  } else if (viewport.latitude > bounds.max_latitude) {
    viewport.latitude = bounds.max_latitude
  }
}

const mapQueryToViewport = ({ latitude = 0, longitude = 0, zoom = 0, pitch = '0', bearing = '0' }, bounds) => {
  const viewport = {
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    zoom: parseFloat(zoom),
    pitch: parseFloat(pitch),
    bearing: parseFloat(bearing)
  }
  clampViewport(viewport, bounds)
  return viewport
}

const mapViewportToQuery = ({ latitude, longitude, zoom, pitch, bearing }) => ({
  latitude: latitude.toFixed(6),
  longitude: longitude.toFixed(6),
  zoom: zoom.toFixed(6),
  pitch: pitch !== 0 ? pitch.toFixed(6) : undefined,
  bearing: bearing !== 0 ? bearing.toFixed(6) : undefined
})

const getDependencyArray = obj =>
  [obj.latitude, obj.longitude, obj.zoom, obj.pitch, obj.bearing]

const doesNotMatch = (a, b) => (
  a.latitude !== b.latitude ||
  a.longitude !== b.longitude ||
  a.zoom !== b.zoom ||
  a.pitch !== b.pitch ||
  a.bearing !== b.bearing
)

const Chloropleth = (props) => {
  const {
    color_scale_type,
    config = {},
    darkMode = false,
    enable_fade_uncertainty,
    geojson,
    handleOnClick,
    lineColor = 'blueGray',
    max_val,
    min_val,
    parameterConfig,
    selected_area,
    values
  } = props

  const isBig = useMediaQuery('(min-width: 2160px)')
  const defaultZoom = useMemo(() => {
    const { default_zoom, default_zoom_mob = default_zoom } = config
    if (typeof default_zoom === 'number') {
      return props.isMobile ? default_zoom_mob : default_zoom
    }
    const { desktop, mobile = desktop, big = desktop } = default_zoom
    if (props.isMobile) return mobile
    if (isBig) return big
    return desktop
  }, [config, props.isMobile, isBig])

  const [query, updateQuery] = useQueryAsState({
    ...mapViewportToQuery({
      latitude: config.default_lat,
      longitude: config.default_lon,
      zoom: defaultZoom,
      pitch: 0,
      bearing: 0
    }),
    uncertainty: '1'
  })

  const [viewport, setViewport] = useState({
    width: 0,
    height: 0,
    ...mapQueryToViewport(query, config.bounds)
  })

  // for bounds checking
  // const vp = new WebMercatorViewport(viewport)
  // console.log(vp.getBounds())

  useEffect(() => {
    setViewport({ ...viewport, ...mapQueryToViewport(query, config.bounds) })
  }, getDependencyArray(query))

  useEffect(() => {
    const timeout = setTimeout(() => {
      const update = mapViewportToQuery(viewport)
      if (doesNotMatch(update, query)) {
        updateQuery(update, 'replace')
      }
    }, 500)
    return () => clearTimeout(timeout)
  }, getDependencyArray(viewport))

  const onViewportChange = newViewport => {
    clampViewport(newViewport, config.bounds)
    setViewport(newViewport)
  }

  const percentage = parameterConfig && parameterConfig.format === 'percentage'

  const hasUncertainty = useMemo(() => {
    if (enable_fade_uncertainty !== undefined) return enable_fade_uncertainty
    if (percentage) { // back compat
      for (const v of Object.values(values)) {
        if (v === undefined) return false
        const { upper, lower } = v
        if (upper !== null && lower !== null && upper !== lower) {
          return true
        }
      }
    }
    return false
  }, [enable_fade_uncertainty, values, percentage])

  const features = useMemo(() => {
    const features = {
      selected: [],
      active: [],
      nulls: [],
      others: []
    }

    if (values === null) {
      return features
    }

    for (const feature of geojson.features) {
      const { area_id } = feature.properties
      const areaValues = values[area_id] || {}
      if (areaValues.mean !== undefined) {
        features.nulls.push(feature) // white bg for alpha and smoother dark mode
        if (area_id === selected_area) features.selected.push(feature)
        const { mean, lower, upper } = areaValues
        if (mean !== null) {
          const _feature = {
            ...feature,
            properties: {
              ...feature.properties,
              value: mean,
              alpha: hasUncertainty ? 1 - (upper - lower) : 1
            }
          }
          features.active.push(_feature)
        }
      } else {
        features.others.push(feature)
      }
    }
    return features
  }, [geojson, values, selected_area, hasUncertainty])

  const colorScale = useMemo(() => {
    if (max_val === 0) {
      return [0, '#fff']
    }

    const stops = color_scale_type === 'R_scale' ? RColourStops : colourStops

    const scale = []
    const min = color_scale_type === 'quadratic' ? Math.sqrt(min_val) : min_val
    const max = color_scale_type === 'quadratic' ? Math.sqrt(max_val) : max_val
    const range = max - min

    for (const { index, rgb } of stops) {
      scale.unshift(rgb)
      scale.unshift(min + range * (1 - index))
    }

    return scale
  }, [max_val, min_val, color_scale_type])

  const showUncertainty = useMemo(() => query.uncertainty === '1', [query.uncertainty])

  const mapStyle = useMemo(() => ({
    version: 8,
    transition: {
      duration: 0
    },
    sources: {
      selectedAreas: {
        type: 'geojson',
        data: {
          ...geojson,
          features: features.selected
        }
      },
      activeAreas: {
        type: 'geojson',
        data: {
          ...geojson,
          features: features.active
        }
      },
      nullAreas: {
        type: 'geojson',
        data: {
          ...geojson,
          features: features.nulls
        }
      },
      otherAreas: {
        type: 'geojson',
        data: {
          ...geojson,
          features: features.others
        }
      }
    },
    layers: [
      {
        id: 'other-areas-fill',
        type: 'fill',
        source: 'otherAreas',
        paint: {
          'fill-color': darkMode ? tailwindColors[lineColor][300] : '#fff'
        }
      },
      {
        id: 'other-areas-line',
        type: 'line',
        source: 'otherAreas',
        paint: {
          'line-color': tailwindColors[lineColor][darkMode ? 400 : 300],
          'line-width': 0.5
        }
      },
      {
        id: 'null-areas-fill',
        type: 'fill',
        source: 'nullAreas',
        paint: {
          'fill-color': '#fff'
        }
      },
      {
        id: 'null-areas-line',
        type: 'line',
        source: 'nullAreas',
        paint: {
          'line-color': tailwindColors[lineColor][500],
          'line-width': 0.5
        }
      },
      {
        id: 'active-areas-fill',
        type: 'fill',
        source: 'activeAreas',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            color_scale_type === 'quadratic'
              ? ['sqrt', ['get', 'value']]
              : ['get', 'value'],
            ...colorScale
          ],
          'fill-opacity': showUncertainty ? ['get', 'alpha'] : 1
        }
      },
      {
        id: 'active-areas-line',
        type: 'line',
        source: 'activeAreas',
        paint: {
          'line-color': tailwindColors[lineColor][600],
          'line-width': 0.5
        }
      },
      {
        id: 'selected-areas-line',
        type: 'line',
        source: 'selectedAreas',
        paint: {
          'line-color': tailwindColors[lineColor][900],
          'line-width': 2
        }
      }
    ]
  }), [features, colorScale, color_scale_type, showUncertainty, darkMode, lineColor])

  const [hoveredFeature, setHoveredFeature] = useState(null)

  const hoverPopup = useMemo(() => {
    if (hoveredFeature === null) return null
    const { area_id, area_name, lat, long } = hoveredFeature.properties
    const value = values[area_id]
    if (area_id in values) {
      return { lat, long, value, label: area_name, onClick: () => handleOnClick(area_id) }
    }
  }, [hoveredFeature, values, handleOnClick])

  const colourBarOpacity = useMemo(() => {
    if (hasUncertainty && showUncertainty) {
      return 0.666
      // let sum = 0
      // for (const { properties } of features.active) {
      //   sum += properties.alpha
      // }
      // return sum / features.active.length
    }
    return 1
  }, [hasUncertainty, showUncertainty, features.active])

  return (
    <Measure
      bounds
      onResize={rect => {
        setViewport({
          ...viewport,
          width: rect.bounds.width || viewport.width,
          height: rect.bounds.height || viewport.height
        })
      }}
    >
      {({ measureRef }) => (
        <div ref={measureRef} className={classnames(props.className, 'relative z-0')}>
          <ReactMapGL
            {...viewport}
            minZoom={config.min_zoom}
            disableTokenWarning
            onViewportChange={onViewportChange}
            mapStyle={mapStyle}
            mapboxApiUrl={null}
            className='bg-gray-50 dark:bg-gray-600'
            interactiveLayerIds={['null-areas-fill', 'active-areas-fill']}
            onNativeClick={e => { // faster for some reason
              const [feature] = e.features
              if (!feature) {
                handleOnClick('overview')
              } else {
                handleOnClick(feature.properties.area_id)
              }
            }}
            onHover={e => {
              const [feature] = e.features
              if (feature && feature.properties.value !== 'null') {
                if (feature.properties.lat === undefined) {
                  // Hack where if no central point is specified
                  // we use mouse position for popup
                  feature.properties.lat = e.lngLat[1]
                  feature.properties.long = e.lngLat[0]
                }
                setHoveredFeature(feature)
              } else {
                setHoveredFeature(null)
              }
            }}
            getCursor={({ isHovering, isDragging }) => {
              if (isDragging) return 'grabbing'
              if (isHovering || selected_area !== 'overview') return 'pointer'
              return 'grab'
            }}
            // onLoad={(e) => {
            //   // if (initialBounds) {
            //   //   e.target.fitToBounds(initialBounds)
            //   // }
            // }}
          >
            <NavigationControl className='right-2 top-2 z-10' />
            { hoverPopup && <MapPopup {...hoverPopup} {...parameterConfig} /> }
          </ReactMapGL>
          <FadeTransition in={max_val > 0}>
            <div className='absolute left-0 bottom-0 w-60 z-10 p-2 pb-0 bg-white dark:bg-gray-700 bg-opacity-80 dark:bg-opacity-80'>
              { hasUncertainty &&
                <form className='mb-1.5 ml-2'>
                  <Checkbox
                    id='map_uncertainty'
                    className='text-primary'
                    checked={showUncertainty}
                    onChange={e => updateQuery({ uncertainty: e.target.checked ? 1 : 0 }, 'replace')}
                  >
                    <span className='text-xs tracking-wide select-none'>
                      fade areas by uncertainty
                    </span>
                  </Checkbox>
                </form> }
              <ColourBar
                dmin={min_val}
                dmax={max_val}
                type={color_scale_type}
                percentage={percentage}
                opacity={colourBarOpacity}
              />
            </div>
          </FadeTransition>
        </div>
      )}
    </Measure>
  )
}

export default Chloropleth
