'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { adminAPI, type Route, type Schedule } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { MapPin, Clock, Bus, TrendingUp, Plus, List, Trash2, Navigation } from 'lucide-react';

// Google Maps API Key
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

interface BusRoute {
  id: string;
  busNumber: string;
  source: string;
  destination: string;
  sourceCoords?: { lat: number; lng: number };
  destCoords?: { lat: number; lng: number };
  peak_hour: 'morning' | 'evening' | 'off-peak';
  color: string;
  expectedPassengers?: number; // Daily passenger count for frequency calculation
}

interface RouteOption {
  route_index: number;
  distance_km: number;
  duration_min: number;
  waypoints: [number, number][];
  gemini_score: number;
  traffic_score: number;
  reasoning: string;
  rank: number;
}

interface BusRouteResult {
  bus_number: string;
  source: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  peak_hour: string;
  total_routes: number;
  routes: RouteOption[];
  selectedRouteIndex?: number; // Which route is selected (0, 1, or 2)
}

export default function AdminDashboard() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'routes' | 'schedules' | 'plan'>('overview');
  const [isMounted, setIsMounted] = useState(false);

  // Multi-bus route planning
  const [busRoutes, setBusRoutes] = useState<BusRoute[]>([
    { id: '1', busNumber: 'Bus 1', source: '', destination: '', peak_hour: 'morning', color: '#FF0000', expectedPassengers: 0 }
  ]);
  const [planResults, setPlanResults] = useState<BusRouteResult[]>([]);
  const [planning, setPlanning] = useState(false);
  const [savingRoute, setSavingRoute] = useState<string | null>(null); // Track which bus route is being saved

  // Google Maps
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<google.maps.Map | null>(null);
  const autocompleteRefs = useRef<{ [key: string]: google.maps.places.Autocomplete }>({});
  const directionsRenderers = useRef<google.maps.DirectionsRenderer[]>([]);
  const polylines = useRef<google.maps.Polyline[]>([]);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    if (!isAuthenticated || user?.role !== 'admin') {
      router.push('/login');
      return;
    }
    fetchData();
  }, [isAuthenticated, user, router, isMounted]);

  // Initialize map separately when component is mounted and on Plan Route tab
  useEffect(() => {
    if (isMounted && activeTab === 'plan' && mapRef.current && !googleMapRef.current) {
      console.log('Initializing Google Maps...');
      initializeMap();
    }
  }, [isMounted, activeTab]);

  const initializeMap = async () => {
    try {
      console.log('=== INITIALIZING GOOGLE MAPS ===');
      console.log('API Key exists:', !!GOOGLE_MAPS_API_KEY);
      console.log('API Key value:', GOOGLE_MAPS_API_KEY);
      console.log('API Key length:', GOOGLE_MAPS_API_KEY?.length);
      console.log('mapRef.current exists:', !!mapRef.current);
      console.log('window.google exists:', !!window.google);

      if (!GOOGLE_MAPS_API_KEY) {
        throw new Error('Google Maps API key is not defined in environment variables');
      }

      // Check if script is already loaded
      if (!window.google) {
        console.log('Loading Google Maps script...');

        // Remove any existing Google Maps scripts to prevent conflicts
        const existingScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
        existingScripts.forEach(script => script.remove());

        const scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places,geometry`;
        console.log('Script URL:', scriptUrl);

        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;

        // Wait for script to load
        await new Promise<void>((resolve, reject) => {
          script.onload = () => {
            console.log('✅ Google Maps script loaded successfully');
            resolve();
          };
          script.onerror = (error) => {
            console.error('❌ Script loading error:', error);
            reject(new Error('Failed to load Google Maps script'));
          };
          document.head.appendChild(script);
        });

        // Wait a bit for Google Maps to initialize
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        console.log('✅ Google Maps already loaded');
      }

      // Verify Google Maps is available
      if (!window.google || !window.google.maps) {
        throw new Error('Google Maps API failed to load');
      }

      // Create map instance
      if (mapRef.current && !googleMapRef.current) {
        console.log('Creating map instance...');

        googleMapRef.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: 23.2599, lng: 77.4126 }, // Bhopal center
          zoom: 12,
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        });

        setMapsLoaded(true);
        console.log('✅ Google Maps initialized successfully!');
        console.log('Map instance:', googleMapRef.current);
      } else {
        console.log('⚠️ Map not created. Conditions:', {
          hasMapRef: !!mapRef.current,
          hasGoogleMapRef: !!googleMapRef.current,
          hasWindowGoogle: !!window.google
        });
      }
    } catch (error) {
      console.error('❌ Error loading Google Maps:', error);
      setMapsLoaded(false);
    }
  };

  const fetchData = async () => {
    try {
      const [routesRes, schedulesRes] = await Promise.all([
        adminAPI.getRoutes(),
        adminAPI.getSchedules(),
      ]);
      setRoutes(routesRes.data.routes);
      setSchedules(schedulesRes.data.schedules);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addBusRoute = () => {
    const colors = [
      '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
      '#FFA500', '#800080', '#008000', '#FFC0CB', '#A52A2A', '#808080',
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E2', '#F8B739', '#52B788'
    ];
    const newRoute: BusRoute = {
      id: Date.now().toString(),
      busNumber: `Bus ${busRoutes.length + 1}`,
      source: '',
      destination: '',
      peak_hour: 'morning',
      color: colors[busRoutes.length % colors.length]
    };
    setBusRoutes([...busRoutes, newRoute]);
  };

  const removeBusRoute = (id: string) => {
    setBusRoutes(busRoutes.filter(r => r.id !== id));
  };

  const updateBusRoute = (id: string, field: keyof BusRoute, value: any) => {
    console.log(`📝 Updating route ${id}, field: ${field}, value: ${value}`);
    setBusRoutes(prevRoutes =>
      prevRoutes.map(r => r.id === id ? { ...r, [field]: value } : r)
    );
  };

  const geocodeAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
    if (!address || !window.google) return null;

    try {
      const geocoder = new window.google.maps.Geocoder();
      const result = await geocoder.geocode({
        address: address + ', Bhopal, Madhya Pradesh, India'
      });

      if (result.results[0]) {
        const location = result.results[0].geometry.location;
        return { lat: location.lat(), lng: location.lng() };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  };

  const setupAutocomplete = (inputId: string, routeId: string, field: 'source' | 'destination') => {
    if (!window.google || !mapsLoaded) {
      console.log(`⚠️ Cannot setup autocomplete for ${inputId}: Google Maps not loaded`);
      return;
    }

    const input = document.getElementById(inputId) as HTMLInputElement;
    if (!input) {
      console.log(`⚠️ Cannot setup autocomplete for ${inputId}: Input element not found`);
      return;
    }

    // Check if autocomplete already exists for this input
    if (autocompleteRefs.current[inputId]) {
      console.log(`⚠️ Autocomplete already exists for ${inputId}, skipping...`);
      return;
    }

    try {
      console.log(`🔧 Setting up autocomplete for ${inputId}...`);

      // Create autocomplete with Bhopal bias
      const autocomplete = new window.google.maps.places.Autocomplete(input, {
        componentRestrictions: { country: 'in' },
        bounds: new window.google.maps.LatLngBounds(
          new window.google.maps.LatLng(23.1, 77.2),
          new window.google.maps.LatLng(23.4, 77.6)
        ),
        strictBounds: false,
        fields: ['formatted_address', 'geometry', 'name', 'place_id']
      });

      // Listen for place selection
      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (place && place.geometry && place.geometry.location) {
          // Update the route with the selected place name
          const placeName = place.name || place.formatted_address || '';

          console.log(`✅ Place selected for ${field} (${inputId}):`, placeName);

          // Update state
          setBusRoutes(prevRoutes =>
            prevRoutes.map(r =>
              r.id === routeId ? { ...r, [field]: placeName } : r
            )
          );
        }
      });

      // Prevent autocomplete from clearing other fields
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
        }
      });

      autocompleteRefs.current[inputId] = autocomplete;
      console.log(`✅ Autocomplete setup complete for ${inputId}`);
    } catch (error) {
      console.error(`❌ Error setting up autocomplete for ${inputId}:`, error);
    }
  };

  // Track which inputs have autocomplete initialized
  const initializedInputs = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (mapsLoaded && activeTab === 'plan' && isMounted) {
      // Setup autocomplete for all visible inputs
      setTimeout(() => {
        busRoutes.forEach(route => {
          const sourceInputId = `source-${route.id}`;
          const destInputId = `dest-${route.id}`;

          // Only setup if not already initialized
          if (!initializedInputs.current.has(sourceInputId)) {
            setupAutocomplete(sourceInputId, route.id, 'source');
            initializedInputs.current.add(sourceInputId);
          }

          if (!initializedInputs.current.has(destInputId)) {
            setupAutocomplete(destInputId, route.id, 'destination');
            initializedInputs.current.add(destInputId);
          }
        });
      }, 100);
    }
  }, [mapsLoaded, activeTab, isMounted, busRoutes.length]); // Only depend on length, not the whole array

  // Clear all routes from map
  const clearMapRoutes = () => {
    directionsRenderers.current.forEach(renderer => renderer.setMap(null));
    directionsRenderers.current = [];
    polylines.current.forEach(polyline => polyline.setMap(null));
    polylines.current = [];
  };

  // Draw a single route option on the map
  const drawRouteOnMap = (waypoints: [number, number][], color: string, routeIndex: number, isSelected: boolean) => {
    if (!googleMapRef.current) return;

    const path = waypoints.map(([lat, lng]) => ({ lat, lng }));

    // Different styles for different route options
    const strokeStyles = [
      { weight: 6, opacity: 0.8 }, // Route 1: Solid thick
      { weight: 5, opacity: 0.6 }, // Route 2: Solid medium
      { weight: 4, opacity: 0.5 }  // Route 3: Solid thin
    ];

    const style = strokeStyles[routeIndex] || strokeStyles[2];

    const polyline = new window.google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: isSelected ? 1.0 : style.opacity,
      strokeWeight: isSelected ? style.weight + 2 : style.weight,
      map: googleMapRef.current,
      zIndex: isSelected ? 1000 : 100 + routeIndex
    });

    polylines.current.push(polyline);

    // Add click listener to select route
    polyline.addListener('click', () => {
      console.log(`Route ${routeIndex} clicked`);
    });
  };

  const handlePlanRoute = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('=== ROUTE PLANNING STARTED ===');

    if (!window.google || !mapsLoaded || !googleMapRef.current) {
      alert('⚠️ Google Maps is still loading. Please wait a moment and try again.');
      return;
    }

    setPlanning(true);

    try {
      clearMapRoutes();

      console.log('🚌 Starting route planning for', busRoutes.length, 'buses');

      // Geocode all addresses
      const geocodedRoutes = await Promise.all(
        busRoutes.map(async (route) => {
          const sourceCoords = await geocodeAddress(route.source);
          const destCoords = await geocodeAddress(route.destination);
          console.log(`Geocoded ${route.busNumber}:`, { sourceCoords, destCoords });
          return { ...route, sourceCoords, destCoords };
        })
      );

      // Filter out routes that couldn't be geocoded
      const validRoutes = geocodedRoutes.filter(route => route.sourceCoords && route.destCoords);

      if (validRoutes.length === 0) {
        alert('Could not geocode any of the addresses. Please check the location names.');
        setPlanning(false);
        return;
      }

      console.log(`Successfully geocoded ${validRoutes.length} out of ${busRoutes.length} routes`);

      // Update bus routes with coordinates
      setBusRoutes(geocodedRoutes);

      // Use batch endpoint to get 3 routes per bus
      const batchRequest = {
        routes: validRoutes.map(route => ({
          source_lat: route.sourceCoords!.lat,
          source_lng: route.sourceCoords!.lng,
          dest_lat: route.destCoords!.lat,
          dest_lng: route.destCoords!.lng,
          peak_hour: route.peak_hour
        }))
      };

      console.log('Sending batch request to backend:', batchRequest);
      const batchResult = await adminAPI.planBatchRoutes(batchRequest);
      console.log('Batch result:', batchResult.data);

      // Process and display all 3 routes for each bus
      const processedResults: BusRouteResult[] = batchResult.data.routes.map((busData: any, busIndex: number) => {
        const busRoute = validRoutes[busIndex];

        // Draw all 3 route options on the map
        busData.routes.forEach((routeOption: RouteOption, routeIndex: number) => {
          drawRouteOnMap(
            routeOption.waypoints,
            busRoute.color,
            routeIndex,
            routeIndex === 0 // First route is selected by default
          );
        });

        return {
          bus_number: busRoute.busNumber,
          source: busData.source,
          destination: busData.destination,
          peak_hour: busData.peak_hour,
          total_routes: busData.total_routes,
          routes: busData.routes,
          selectedRouteIndex: 0 // Default to first route
        };
      });

      setPlanResults(processedResults);
      console.log('✅ Route planning complete! Showing 3 routes per bus.');

    } catch (error: any) {
      console.error('Route planning error:', error);
      alert(error.response?.data?.detail || error.message || 'Failed to plan routes');
    } finally {
      setPlanning(false);
    }
  };

  // Select a specific route for a bus
  const selectRoute = (busIndex: number, routeIndex: number) => {
    setPlanResults(prevResults => {
      const newResults = [...prevResults];
      newResults[busIndex].selectedRouteIndex = routeIndex;
      return newResults;
    });

    // Redraw routes with new selection
    clearMapRoutes();
    planResults.forEach((busResult, bIdx) => {
      const busRoute = busRoutes[bIdx];
      busResult.routes.forEach((routeOption, rIdx) => {
        const isSelected = bIdx === busIndex ? rIdx === routeIndex : rIdx === busResult.selectedRouteIndex;
        drawRouteOnMap(routeOption.waypoints, busRoute.color, rIdx, isSelected);
      });
    });
  };

  // Save selected route to database
  const saveSelectedRoute = async (busIndex: number) => {
    const busResult = planResults[busIndex];
    const busRoute = busRoutes[busIndex];
    const selectedRoute = busResult.routes[busResult.selectedRouteIndex || 0];

    if (!selectedRoute) {
      alert('No route selected');
      return;
    }

    setSavingRoute(busRoute.id);

    try {
      const saveRequest = {
        bus_id: busRoute.id,
        bus_number: busRoute.busNumber,
        route_index: busResult.selectedRouteIndex || 0,
        source_name: busRoute.source,
        dest_name: busRoute.destination,
        source_lat: busResult.source.lat,
        source_lng: busResult.source.lng,
        dest_lat: busResult.destination.lat,
        dest_lng: busResult.destination.lng,
        waypoints: selectedRoute.waypoints,
        distance_km: selectedRoute.distance_km,
        duration_min: selectedRoute.duration_min,
        gemini_score: selectedRoute.gemini_score,
        traffic_score: selectedRoute.traffic_score,
        reasoning: selectedRoute.reasoning,
        peak_hour: busRoute.peak_hour,
        expected_passengers_daily: busRoute.expectedPassengers || 0
      };

      const response = await adminAPI.saveSelectedRoute(saveRequest);
      console.log('Route saved:', response.data);

      const freq = response.data.frequency_recommendation;
      const sched = response.data.schedule;

      let message = `✅ Route and Schedule Saved Successfully!\n\n`;
      message += `📍 Route ID: ${response.data.route_id}\n`;
      message += `🚌 Bus: ${busRoute.busNumber}\n\n`;

      if (freq) {
        message += `🤖 AI Recommendations:\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `🚍 Buses Needed: ${freq.buses_needed} buses\n`;
        message += `⏱️  Frequency: Every ${freq.frequency_min} minutes\n`;
        if (freq.expected_passengers_daily) {
          message += `👥 Expected Passengers: ${freq.expected_passengers_daily}/day\n`;
          message += `📊 Capacity per Bus: 70 passengers\n`;
        }
        message += `\n`;
      }

      if (sched) {
        message += `📅 Schedule Generated:\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
        message += `🕐 First Departure: ${sched.first_departure}\n`;
        message += `🕙 Last Departure: ${sched.last_departure}\n`;
        message += `🔢 Total Trips: ${sched.total_trips} trips/day\n`;
      }

      alert(message);

      // Refresh routes and schedules list
      fetchData();

    } catch (error: any) {
      console.error('Error saving route:', error);
      alert(error.response?.data?.detail || 'Failed to save route');
    } finally {
      setSavingRoute(null);
    }
  };

  if (loading || !isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Manage routes, schedules, and bus operations</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-6 py-4 font-medium transition ${
                activeTab === 'overview'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <TrendingUp className="w-5 h-5 inline mr-2" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('plan')}
              className={`px-6 py-4 font-medium transition ${
                activeTab === 'plan'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <MapPin className="w-5 h-5 inline mr-2" />
              Plan Route
            </button>
            <button
              onClick={() => setActiveTab('routes')}
              className={`px-6 py-4 font-medium transition ${
                activeTab === 'routes'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <List className="w-5 h-5 inline mr-2" />
              Routes ({routes.length})
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`px-6 py-4 font-medium transition ${
                activeTab === 'schedules'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Clock className="w-5 h-5 inline mr-2" />
              Schedules ({schedules.length})
            </button>
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Total Routes</h3>
                <Bus className="w-8 h-8 text-blue-600" />
              </div>
              <p className="text-3xl font-bold text-blue-600">{routes.length}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Active Schedules</h3>
                <Clock className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-3xl font-bold text-green-600">
                {schedules.filter(s => s.active).length}
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Avg AI Score</h3>
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
              <p className="text-3xl font-bold text-purple-600">
                {routes.length > 0
                  ? (routes.reduce((sum, r) => sum + (r.gemini_score || 0), 0) / routes.length).toFixed(1)
                  : '0.0'}
              </p>
            </div>
          </div>
        )}

        {/* Plan Route Tab */}
        {activeTab === 'plan' && (
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Left Panel - Multi-Bus Form */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Multi-Bus Route Planning</h2>
                <button
                  type="button"
                  onClick={addBusRoute}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition disabled:opacity-50"
                  disabled={busRoutes.length >= 20}
                >
                  <Plus className="w-4 h-4" />
                  Add Bus ({busRoutes.length}/20)
                </button>
              </div>

              <form onSubmit={handlePlanRoute} className="space-y-6">
                {/* Bus Routes List */}
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {busRoutes.map((route, index) => (
                    <div key={route.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: route.color }}
                          />
                          <input
                            type="text"
                            value={route.busNumber}
                            onChange={(e) => updateBusRoute(route.id, 'busNumber', e.target.value)}
                            className="font-semibold text-gray-900 bg-transparent border-none focus:outline-none"
                          />
                        </div>
                        {busRoutes.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeBusRoute(route.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Navigation className="w-3 h-3 inline mr-1" />
                            Source Location
                          </label>
                          <input
                            id={`source-${route.id}`}
                            type="text"
                            value={route.source}
                            onChange={(e) => updateBusRoute(route.id, 'source', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white outline-none"
                            placeholder="Start typing location name..."
                            autoComplete="off"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            Destination Location
                          </label>
                          <input
                            id={`dest-${route.id}`}
                            type="text"
                            value={route.destination}
                            onChange={(e) => updateBusRoute(route.id, 'destination', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white outline-none"
                            placeholder="Start typing location name..."
                            autoComplete="off"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Clock className="w-3 h-3 inline mr-1" />
                            Peak Hour
                          </label>
                          <select
                            value={route.peak_hour}
                            onChange={(e) => updateBusRoute(route.id, 'peak_hour', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
                          >
                            <option value="morning">Morning Peak</option>
                            <option value="evening">Evening Peak</option>
                            <option value="off-peak">Off-Peak</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <TrendingUp className="w-3 h-3 inline mr-1" />
                            Expected Daily Passengers (Optional)
                          </label>
                          <input
                            type="number"
                            value={route.expectedPassengers || ''}
                            onChange={(e) => updateBusRoute(route.id, 'expectedPassengers', parseInt(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white outline-none"
                            placeholder="e.g., 500"
                            min="0"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            AI will suggest bus frequency based on this
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={planning}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {planning ? (
                    <>
                      <LoadingSpinner size="sm" />
                      Planning {busRoutes.length} Routes...
                    </>
                  ) : (
                    <>
                      <Bus className="w-5 h-5" />
                      Plan {busRoutes.length} Route{busRoutes.length > 1 ? 's' : ''} with AI
                    </>
                  )}
                </button>
              </form>

              {/* Route Selection Results */}
              {planResults && planResults.length > 0 && (
                <div className="mt-6 space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="font-semibold text-green-900 mb-2">✓ Route Planning Complete!</h3>
                    <p className="text-green-700">
                      Successfully planned {planResults.length} bus routes with 3 options each. Select the best route for each bus below.
                    </p>
                  </div>

                  {/* Route Selection Cards */}
                  <div className="space-y-4 max-h-96 overflow-y-auto">
                    {planResults.map((busResult, busIndex) => {
                      const busRoute = busRoutes[busIndex];
                      const selectedRoute = busResult.routes[busResult.selectedRouteIndex || 0];

                      return (
                        <div key={busIndex} className="border border-gray-200 rounded-lg p-4 bg-white">
                          <div className="flex items-center gap-2 mb-3">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: busRoute.color }}
                            />
                            <h4 className="font-semibold text-gray-900">{busResult.bus_number}</h4>
                            <span className="text-sm text-gray-600">
                              {busRoute.source} → {busRoute.destination}
                            </span>
                          </div>

                          {/* AI Recommendation Box */}
                          {busRoute.expectedPassengers && busRoute.expectedPassengers > 0 && (() => {
                            // SIMPLE AND CORRECT CALCULATION LOGIC
                            const dailyPassengers = busRoute.expectedPassengers;
                            const busCapacity = 70;
                            const oneWayDuration = selectedRoute.duration_min;
                            const layoverTime = 10; // minutes for turnaround
                            const roundTripTime = (oneWayDuration * 2) + layoverTime;
                            const operatingHours = 16 * 60; // 16 hours in minutes

                            // Step 1: How many trips needed to move all passengers?
                            const tripsNeeded = Math.ceil(dailyPassengers / busCapacity);

                            // Step 2: How many trips can 1 bus make in a day?
                            const tripsPerBus = Math.floor(operatingHours / roundTripTime);

                            // Step 3: How many buses do we need?
                            const busesNeeded = Math.ceil(tripsNeeded / tripsPerBus);

                            // Step 4: What's the frequency? (how often does a bus depart)
                            const actualFrequency = Math.floor(roundTripTime / busesNeeded);

                            // Step 5: Calculate actual capacity
                            const totalTripsPerDay = tripsPerBus * busesNeeded;
                            const totalDailyCapacity = totalTripsPerDay * busCapacity;

                            // Step 6: Check utilization
                            const utilizationRate = ((dailyPassengers / totalDailyCapacity) * 100).toFixed(1);

                            return (
                              <div className="mb-3 p-3 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <TrendingUp className="w-4 h-4 text-purple-600" />
                                  <span className="font-semibold text-purple-900">🤖 AI Recommendation</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-sm mb-2">
                                  <div className="text-gray-700">
                                    <span className="font-medium">👥 Daily Passengers:</span> {dailyPassengers}
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">🚍 Buses Needed:</span>{' '}
                                    <span className="text-blue-600 font-bold">{busesNeeded}</span> {busesNeeded === 1 ? 'bus' : 'buses'}
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">⏱️ Frequency:</span>{' '}
                                    <span className="text-blue-600 font-bold">Every {actualFrequency} min</span>
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">🔄 Round Trip:</span> {roundTripTime} min
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">📊 Trips Needed:</span> {tripsNeeded} trips
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">🚌 Trips/Bus:</span> {tripsPerBus} trips
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">💺 Total Capacity:</span> {totalDailyCapacity}/day
                                  </div>
                                  <div className="text-gray-700">
                                    <span className="font-medium">📈 Utilization:</span>{' '}
                                    <span className={parseFloat(utilizationRate) > 90 ? 'text-red-600 font-bold' : parseFloat(utilizationRate) > 70 ? 'text-yellow-600 font-bold' : 'text-green-600 font-bold'}>
                                      {utilizationRate}%
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs p-2 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                  <span className="font-medium">💡 Logic:</span> {tripsNeeded} trips needed ÷ {tripsPerBus} trips/bus = {busesNeeded} {busesNeeded === 1 ? 'bus' : 'buses'}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Route Options */}
                          <div className="space-y-2 mb-3">
                            {busResult.routes.map((routeOption, routeIndex) => (
                              <div
                                key={routeIndex}
                                onClick={() => selectRoute(busIndex, routeIndex)}
                                className={`p-3 rounded-lg border-2 cursor-pointer transition ${
                                  busResult.selectedRouteIndex === routeIndex
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="font-medium text-gray-900">
                                        Route {routeIndex + 1}
                                      </span>
                                      {busResult.selectedRouteIndex === routeIndex && (
                                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">
                                          Selected
                                        </span>
                                      )}
                                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                        Rank #{routeOption.rank}
                                      </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                                      <div>📏 {routeOption.distance_km.toFixed(1)} km</div>
                                      <div>⏱️ {routeOption.duration_min.toFixed(0)} min</div>
                                      <div>🎯 AI Score: {routeOption.gemini_score.toFixed(1)}/10</div>
                                      <div>🚦 Traffic: {routeOption.traffic_score.toFixed(1)}/10</div>
                                    </div>
                                    {routeOption.reasoning && (
                                      <p className="text-xs text-gray-500 mt-2 italic">
                                        {routeOption.reasoning}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Save Button */}
                          <button
                            onClick={() => saveSelectedRoute(busIndex)}
                            disabled={savingRoute === busRoute.id}
                            className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {savingRoute === busRoute.id ? (
                              <>
                                <LoadingSpinner size="sm" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Bus className="w-4 h-4" />
                                Save Route {busResult.selectedRouteIndex! + 1} for {busResult.bus_number}
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Panel - Google Maps */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Route Visualization</h2>
              <div className="relative">
                <div
                  ref={mapRef}
                  className="w-full h-[600px] rounded-lg border-2 border-gray-200 bg-gray-50"
                />
                {!mapsLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg border-2 border-gray-200">
                    <div className="text-center">
                      <LoadingSpinner size="lg" />
                      <p className="mt-4 text-gray-600 font-medium">Loading Google Maps...</p>
                      <p className="text-sm text-gray-500 mt-2">Please wait a moment</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Route Legend */}
              {planResults && planResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h3 className="font-semibold text-gray-900">Route Legend:</h3>
                  <div className="text-xs text-gray-600 mb-2">
                    Each bus has 3 route options shown in the same color with different line styles
                  </div>
                  {planResults.map((busResult, index) => {
                    const busRoute = busRoutes[index];
                    return (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: busRoute.color }}
                        />
                        <span className="font-medium">{busResult.bus_number}</span>
                        <span className="text-gray-600">
                          - {busResult.total_routes} options (Route {(busResult.selectedRouteIndex || 0) + 1} selected)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Routes Tab */}
        {activeTab === 'routes' && (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-900">All Routes</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">AI Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {routes.map((route) => (
                    <tr key={route._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{route.route_id}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{route.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{route.total_distance_km.toFixed(1)} km</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{route.estimated_duration_min} min</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                          {route.gemini_score?.toFixed(1) || 'N/A'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Schedules Tab */}
        {activeTab === 'schedules' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b">
                <h2 className="text-2xl font-bold text-gray-900">All Schedules</h2>
                <p className="text-sm text-gray-600 mt-1">
                  View bus schedules with departure times for passenger tracking and ETA calculation
                </p>
              </div>

              {schedules.length === 0 ? (
                <div className="p-12 text-center text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No schedules created yet. Save a route to auto-generate schedules.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {schedules.map((schedule: any) => {
                    const route = routes.find(r => r.route_id === schedule.route_id);
                    const departureTimes = schedule.departure_times || [];

                    return (
                      <div key={schedule._id} className="p-6 hover:bg-gray-50">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-lg font-semibold text-gray-900">
                                {route?.name || schedule.route_id}
                              </h3>
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                schedule.active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}>
                                {schedule.active ? 'Active' : 'Inactive'}
                              </span>
                              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 capitalize">
                                {schedule.peak_hour}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-gray-600">
                              <span>🚌 Bus: {schedule.bus_number || schedule.bus_id}</span>
                              <span>📍 Route: {schedule.route_id}</span>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-2xl font-bold text-blue-600">
                              {schedule.suggested_buses_count}
                            </div>
                            <div className="text-xs text-gray-500">Buses Needed</div>
                          </div>
                        </div>

                        <div className="grid md:grid-cols-4 gap-4 mb-4">
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">Frequency</div>
                            <div className="text-lg font-semibold text-gray-900">
                              {schedule.frequency_min} min
                            </div>
                          </div>
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">First Departure</div>
                            <div className="text-lg font-semibold text-gray-900">
                              {departureTimes[0] || schedule.start_time || 'N/A'}
                            </div>
                          </div>
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">Last Departure</div>
                            <div className="text-lg font-semibold text-gray-900">
                              {departureTimes[departureTimes.length - 1] || schedule.end_time || 'N/A'}
                            </div>
                          </div>
                          <div className="bg-gray-50 p-3 rounded-lg">
                            <div className="text-xs text-gray-500 mb-1">Total Trips</div>
                            <div className="text-lg font-semibold text-gray-900">
                              {departureTimes.length || 0}
                            </div>
                          </div>
                        </div>

                        {departureTimes.length > 0 && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="text-sm font-medium text-gray-700">
                                🕐 Departure Times (for passenger ETA tracking)
                              </h4>
                              <span className="text-xs text-gray-500">
                                {departureTimes.length} departures
                              </span>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-lg max-h-32 overflow-y-auto">
                              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                                {departureTimes.map((time: string, idx: number) => (
                                  <div
                                    key={idx}
                                    className="text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200 text-center"
                                  >
                                    {time}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

