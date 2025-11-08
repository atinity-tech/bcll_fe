import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log('API Request:', config.method?.toUpperCase(), config.url, config.data);
  return config;
});

// Add response interceptor for debugging
api.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Error:', error.response?.status, error.response?.data, error.config?.url);
    return Promise.reject(error);
  }
);

// Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface RoutePlanRequest {
  source_lat: number;
  source_lng: number;
  dest_lat: number;
  dest_lng: number;
  peak_hour?: 'morning' | 'evening' | 'off-peak';
}

export interface BusSearchRequest {
  source_lat: number;
  source_lng: number;
  dest_lat: number;
  dest_lng: number;
}

export interface IntermediateStop {
  name: string;
  lat: number;
  lng: number;
  sequence: number;
  distance_from_start_km: number;
  estimated_time_from_start_min: number;
}

export interface StopTiming {
  stop_name: string;
  stop_lat: number;
  stop_lng: number;
  arrival_time: string;
  departure_time: string;
}

export interface Route {
  _id: string;
  route_id: string;
  name: string;
  source_stop_id: string;
  dest_stop_id: string;
  path: any[];
  intermediate_stops?: IntermediateStop[];
  total_distance_km: number;
  estimated_duration_min: number;
  gemini_score: number;
  traffic_score: number;
  created_at: string;
}

export interface Schedule {
  _id: string;
  route_id: string;
  bus_id: string;
  bus_instance_id?: string;
  bus_number?: string;
  peak_hour: string;
  start_time: string;
  end_time?: string;
  frequency_min: number;
  suggested_buses_count: number;
  departure_times?: string[];
  stop_timings?: StopTiming[];
  deployment_sequence?: number;
  active: boolean;
  created_at: string;
}

export interface BusSearchResult {
  route_id: string;
  route_name: string;
  source_name: string;
  dest_name: string;
  bus_numbers: string[];
  distance_km: number;
  eta_min: number;
  fare: number;
  frequency_min: number;
  is_peak_hour: boolean;
  waypoints: [number, number][];
  departure_times: string[];
  total_buses: number;
}

export interface TravelHistory {
  _id: string;
  passenger_id: string;
  route_id: string;
  source_lat: number;
  source_lng: number;
  dest_lat: number;
  dest_lng: number;
  travel_time_min: number;
  day_of_week: string;
  timestamp: string;
}

// Auth API
export const authAPI = {
  adminLogin: (data: LoginRequest) =>
    api.post<TokenResponse>('/auth/admin/login', data),
  
  passengerRegister: (data: RegisterRequest) =>
    api.post<TokenResponse>('/auth/passenger/register', data),
  
  passengerLogin: (data: LoginRequest) =>
    api.post<TokenResponse>('/auth/passenger/login', data),
};

// Admin API
export const adminAPI = {
  planRoute: (data: RoutePlanRequest) =>
    api.post('/admin/route/plan', data),

  planBatchRoutes: (data: { routes: RoutePlanRequest[] }) =>
    api.post('/admin/route/plan-batch', data),

  saveSelectedRoute: (data: any) =>
    api.post('/admin/route/select-and-save', data),

  createRoute: (data: any) =>
    api.post('/admin/route/create', data),

  createSchedule: (data: { route_id: string; peak_hour: string }) =>
    api.post('/admin/schedule/create', data),

  getRoutes: () =>
    api.get<{ total: number; routes: Route[] }>('/admin/routes'),

  getSchedules: () =>
    api.get<{ total: number; schedules: Schedule[] }>('/admin/schedules'),

  deployMultipleBuses: (route_id: string, data: { num_buses: number; frequency_min: number; peak_hour: string }) =>
    api.post(`/admin/route/${route_id}/deploy-buses`, data),

  getScheduleMatrix: (route_id: string) =>
    api.get(`/admin/route/${route_id}/schedule-matrix`),

  updateRoutePlaceNames: (route_id: string) =>
    api.post(`/admin/routes/${route_id}/update-place-names`),

  updateAllRoutePlaceNames: () =>
    api.post('/admin/routes/update-all-place-names'),
};

// Passenger API
export const passengerAPI = {
  searchBuses: (data: BusSearchRequest) =>
    api.post<BusSearchResult[]>('/passenger/search', data),

  getRecommendations: () =>
    api.get('/passenger/recommendations'),

  getHistory: () =>
    api.get<{ total: number; history: TravelHistory[] }>('/passenger/history'),

  calculateFare: (data: { distance_km: number; is_peak_hour: boolean }) =>
    api.post('/passenger/fare', data),

  findConnections: (data: { current_lat: number; current_lng: number; final_dest_lat: number; final_dest_lng: number }) =>
    api.post('/passenger/find-connections', data),

  startTrip: (data: { source_name: string; source_lat: number; source_lng: number; dest_name: string; dest_lat: number; dest_lng: number; route_id: string; bus_number: string }) =>
    api.post('/passenger/trip/start', null, { params: data }),

  switchRoute: (data: { new_route_id: string; new_bus_number: string; boarding_location_name: string; boarding_lat: number; boarding_lng: number }) =>
    api.post('/passenger/trip/switch-route', null, { params: data }),

  completeTrip: () =>
    api.post('/passenger/trip/complete'),
};

export default api;

