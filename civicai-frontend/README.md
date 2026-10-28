# CivicAI Frontend

React dashboard for the AI-Based Civic Infrastructure Inspection System.

## Stack

- React 18 + React Router
- Tailwind CSS (slate / navy municipal theme)
- Leaflet + react-leaflet (OpenStreetMap)
- Recharts analytics
- Axios → `http://localhost:5000/api`
- react-hot-toast notifications

## Setup

```bash
cd civicai-frontend
npm install
npm start
```

App runs at [http://localhost:3000](http://localhost:3000). Ensure the Express API is running on port 5000.

## Routes

| Path | Role | Purpose |
|------|------|---------|
| `/login` | Public | Role select + JWT login |
| `/upload` | Inspector, Officer | Image upload, GPS/map pin, AI analyze |
| `/map` | All authenticated | Severity-colored GIS markers + filters + assign |
| `/dashboard` | Officer, Maintenance | Summary cards + Recharts + hotspot table |
| `/maintenance` | Officer, Maintenance | Kanban / table task tracker |

## Environment (optional)

Create `.env`:

```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_ASSET_URL=http://localhost:5000
```
