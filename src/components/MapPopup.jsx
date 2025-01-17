import React from 'react'
import { Popup } from 'react-map-gl'

const formatPct = (v, precision = 1) => { const _v = v * 100; return `${Number.isInteger(_v) ? _v : _v.toFixed(precision)}%` }
const formatNumber = (v, precision = 2) => {
  if (Number.isInteger(v)) return v.toLocaleString()
  const fixed = v.toFixed(precision)
  return parseFloat(fixed).toLocaleString(undefined, { minimumFractionDigits: precision })
}

const MapPopup = ({ value, format, precision = {}, lat, long, onClick, label }) => {
  const formatValue = React.useMemo(() => format === 'percentage' ? formatPct : formatNumber, [format])
  return (
    <Popup
      closeButton={false}
      captureDrag={false}
      latitude={lat}
      longitude={long}
      className='text-center text-current leading-none font-sans'
      tipSize={8}
    >
      <div className='p-2' onClick={onClick}>
        { value.mean !== null &&
          <p className='font-bold text-gray-700 dark:text-gray-200'>
            {formatValue(value.mean, precision.mean)}
          </p> }
        <p className='text-sm dark:text-white'>
          {label}
        </p>
      { value && value.upper !== null && value.lower !== null &&
        <p className='text-xs tracking-wide text-gray-700 dark:text-gray-200'>
          {formatValue(value.lower, precision.range)} &ndash; {formatValue(value.upper, precision.range)}
        </p> }
      </div>
    </Popup>
  )
}

export default MapPopup
