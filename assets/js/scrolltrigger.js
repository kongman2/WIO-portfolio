// ScrollTrigger initialization and management
(function() {
  'use strict';
  
  // Wait for GSAP and ScrollTrigger to be loaded
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.error('GSAP or ScrollTrigger not loaded');
    return;
  }
  
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);
  
  let panels = gsap.utils.toArray(".panel");
  let panelTriggers = [];
  let pageScrollTrigger = null;
  
  // Function to check if mobile
  function isMobileDevice() {
    return window.innerWidth <= 768;
  }
  
  // Function to initialize ScrollTrigger
  function initScrollTrigger() {
    const currentIsMobile = isMobileDevice();
    
    // Kill existing triggers
    panelTriggers.forEach(trigger => trigger.kill());
    panelTriggers = [];
    if (pageScrollTrigger) {
      pageScrollTrigger.kill();
      pageScrollTrigger = null;
    }
    
    // Only create ScrollTrigger on desktop
    if (!currentIsMobile) {
      panels.forEach((panel, i) => {
        const trigger = ScrollTrigger.create({
          trigger: panel,
          start: "top top", 
          pin: true, 
          pinSpacing: false,
          refreshPriority: -1,
          anticipatePin: 1
        });
        panelTriggers.push(trigger);
      });
    }
    
    return currentIsMobile;
  }
  
  // Initialize on load
  let isMobile = initScrollTrigger();
  
  let maxScroll;
  let lastScrollTime = Date.now();
  let lastScrollY = window.scrollY;
  let isFastScrolling = false;
  let rafId = null;
  
  function onResize() {
    const wasMobile = isMobile;
    isMobile = initScrollTrigger();
    
    if (!isMobile) {
      maxScroll = ScrollTrigger.maxScroll(window) - 1;
    }
    // Only refresh if actually needed (mobile state changed)
    if (wasMobile !== isMobile) {
      ScrollTrigger.refresh();
    }
  }
  onResize();
  
  // Throttled resize handler (unified) - increased delay for better performance
  let resizeTimeout;
  let isResizing = false;
  window.addEventListener("resize", () => {
    if (isResizing) return;
    isResizing = true;
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      onResize();
      isResizing = false;
    }, 200);
  }, { passive: true });
  
  // Optimized scroll handler - single event listener with throttling
  let scrollThrottle = false;
  window.addEventListener("scroll", (e) => {
    // Throttle scroll handler
    if (scrollThrottle) return;
    scrollThrottle = true;
    
    // Cancel previous frame
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    
    rafId = requestAnimationFrame(() => {
      const now = Date.now();
      const currentScroll = window.scrollY;
      const timeDiff = now - lastScrollTime;
      const scrollDiff = Math.abs(currentScroll - lastScrollY);
      
      // Track scroll velocity (only if enough time passed)
      if (timeDiff > 16) { // ~60fps
        const velocity = scrollDiff / timeDiff;
        // Lower threshold - only disable snap for very fast scrolling
        isFastScrolling = velocity > 2.0; // Increased from 1.5 to 2.0
        lastScrollTime = now;
        lastScrollY = currentScroll;
        
        // Reset scroll accumulator if scrolling stopped (no movement for 300ms)
        if (scrollStopTimeout) {
          clearTimeout(scrollStopTimeout);
        }
        scrollStopTimeout = setTimeout(() => {
          scrollAccumulator = 0; // Reset when scroll stops
        }, 300);
      }
      
      // Boundary check (only when at extremes, and only on desktop)
      // Cache isMobile check to avoid repeated function calls
      if (!isMobile) {
        // Only check maxScroll when near boundaries to avoid expensive calculation
        if (currentScroll <= 10 || currentScroll >= document.documentElement.scrollHeight - window.innerHeight - 10) {
          const maxScrollValue = ScrollTrigger.maxScroll(window);
          if (currentScroll <= 0) {
            window.scrollTo(0, 0);
          } else if (currentScroll >= maxScrollValue) {
            window.scrollTo(0, maxScrollValue);
          }
        }
      }
      
      scrollThrottle = false;
      rafId = null;
    });
  }, { passive: true });
  
  // Simplified snap with velocity check (disabled on mobile)
  let lastSnapValue = 0;
  let snapThreshold = 0.35; // Minimum scroll distance to trigger snap (35% of section) - increased for longer stay
  let scrollAccumulator = 0; // Track accumulated scroll distance
  let lastScrollPosition = 0;
  let scrollStopTimeout = null;
  
  function initSnap() {
    if (pageScrollTrigger) {
      pageScrollTrigger.kill();
      pageScrollTrigger = null;
    }
    
    // Reset accumulator
    scrollAccumulator = 0;
    lastScrollPosition = 0;
    
    // Use cached isMobile value instead of calling function
    if (!isMobile) {
      pageScrollTrigger = ScrollTrigger.create({ 
        snap: {
          snapTo: (value) => {
            // Don't snap if scrolling fast
            if (isFastScrolling) {
              scrollAccumulator = 0; // Reset on fast scroll
              return value;
            }
            
            // Track accumulated scroll distance
            const scrollDelta = Math.abs(value - lastScrollPosition);
            scrollAccumulator += scrollDelta;
            lastScrollPosition = value;
            
            // Only snap if accumulated enough scroll distance
            if (scrollAccumulator < snapThreshold) {
              return value; // Don't snap - stay in current section
            }
            
            // Calculate snapped value
            const snappedValue = gsap.utils.snap(1 / panels.length, value);
            
            // Only snap if actually moving to a different section
            if (Math.abs(snappedValue - lastSnapValue) > 0.1) {
              // Reset accumulator when snapping to new section
              scrollAccumulator = 0;
              lastSnapValue = snappedValue;
              return snappedValue;
            }
            
            // Reset accumulator if not snapping
            scrollAccumulator = 0;
            return value;
          },
          duration: { min: 0.8, max: 1.5 }, // Longer duration for smoother transition
          delay: 0.8, // Longer delay - wait much longer before snapping
          inertia: true,
          ease: "power2.inOut"
        }
      });
    }
  }
  
  initSnap();
  
  // Update snap on resize
  const originalOnResize = onResize;
  onResize = function() {
    originalOnResize();
    initSnap();
  };
  
  // Export panels for menu links
  window.scrollTriggerPanels = panels;
})();

