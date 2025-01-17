import React, { useCallback, useEffect, useRef } from 'react'
import { BsArrowUpShort, BsSearch } from 'react-icons/bs'
import { HiX } from 'react-icons/hi'

import { Heading, DescriptiveHeading } from './Typography'
import Spinner from './Spinner'
import FadeTransition from './FadeTransition'
import Button from './Button'
import ComboBox from './ComboBox'

import { useMobile } from '../hooks/useMediaQuery'
import { useConfig } from '../config'

const MobilePopover = ({ children }) => <div className='mt-3 -mx-4'>{children}</div>

const LocationFilter = (props) => {
  const {
    className, loading, onChange,
    category, heading, subheading, showOverviewButton, loadOverview, overview,
    isSearching, setIsSearching, filteredItems, searchTerm, setSearchTerm
  } = props

  const searchButtonRef = useRef()
  const onSearchClose = useCallback(() => {
    setIsSearching(false)
  }, [setIsSearching])

  const previousIsSearching = useRef()
  useEffect(() => {
    if (previousIsSearching.current === true && isSearching === false) {
      searchButtonRef.current.focus()
    }
    previousIsSearching.current = isSearching
  }, [isSearching])

  const isMobile = useMobile()
  const { ontology } = useConfig()
  const { noun_plural, search_placeholder = noun_plural } = ontology.area

  return (
    <div className={className}>
      { isSearching
        ? <>
          <div className='flex justify-between items-center h-6 mb-3'>
            <DescriptiveHeading className='whitespace-nowrap'>
              Search
            </DescriptiveHeading>
            <Button
              className='box-content relative z-10 h-6 pt-0 pb-0 pl-1 pr-1'
              title='Close'
              onClick={onSearchClose}
            >
              <HiX className='h-4 w-4 fill-current text-gray-600 dark:text-gray-300' />
            </Button>
          </div>
          <ComboBox
            ariaLabel='Areas'
            items={filteredItems}
            onChange={setSearchTerm}
            onClose={onSearchClose}
            onSelect={onChange}
            placeholder={search_placeholder}
            popover={isMobile ? MobilePopover : undefined}
            value={searchTerm}
          />
        </>
        : <>
          <div className='flex justify-between items-center h-6'>
            <DescriptiveHeading className='whitespace-nowrap'>
              {category}
            </DescriptiveHeading>
            { showOverviewButton &&
              <Button
                title='Return to overview'
                className='relative z-10 -top-0.5 h-6 pl-0.5 pr-2 flex items-center !text-primary hover:bg-gray-50'
                onClick={loadOverview}
                tabIndex={isSearching ? '-1' : undefined}
              >
                <BsArrowUpShort className='h-6 w-6 fill-current' />
                {overview.short_heading}
              </Button> }
          </div>
          <div className='flex justify-between space-x-2 w-full'>
            <div className='flex-shrink min-w-0'>
              <Heading className='relative z-0 leading-6 truncate my-0.5'>
                {heading}
              </Heading>
              <p className='text-sm leading-6 h-6 text-gray-600 dark:text-gray-400 font-medium'>
                {subheading}
              </p>
            </div>
            <Button
              ref={searchButtonRef}
              className='flex-shrink-0 h-10 md:h-8 w-11 md:w-9 flex items-center justify-center mt-0.5'
              onClick={() => setIsSearching(true)} title='Search areas'
              tabIndex={isSearching ? '-1' : undefined}
            >
              <BsSearch className='flex-shrink-0 h-5 md:h-4 w-5 md:w-4 text-current' />
            </Button>
          </div>
        </> }
      <FadeTransition in={loading}>
        <div className='bg-white dark:bg-gray-700 absolute inset-1 grid place-content-center z-10'>
          <Spinner className='text-gray-500 dark:text-gray-300 w-6 h-6 mt-2' />
        </div>
      </FadeTransition>
    </div>
  )
}

export default LocationFilter
