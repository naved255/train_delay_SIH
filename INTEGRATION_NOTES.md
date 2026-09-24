# SIH integration notes

## Existing problems found
1. Backend was a mix of CommonJS and ES modules even though `package.json` declared `"type": "module"`. This prevented the server/routes from loading consistently.
2. `server.js` did not mount the train/station/cascade/feeder routers and did not start MongoDB/simulator.
3. The frontend login created `mock_jwt_token_2026` locally and never called the backend login route.
4. Passenger, Station Staff, Control Room and Feeder pages were using hard-coded dummy data.
5. Protected backend actions existed, but the frontend was not actually calling them.
6. The ML service was optional but the frontend had no backend fallback path.

## Implemented
- Converted backend auth/server/middleware/routes to ESM.
- Added CORS, DB startup, health endpoint and simulator startup.
- Added JWT login and role authorization.
- Added `/api/trains/running` as the main passenger/control-room data endpoint.
- Added dynamic station operations persistence.
- Added platform assignment and announcement APIs.
- Added authenticated delay injection.
- Added authenticated feeder synchronization.
- Connected all four dashboards to the backend.
- Added 8-second polling to live dashboards.
- Added backend ETA calculation using section travel time + predicted delay.
- Kept FastAPI/LightGBM as an optional prediction layer with backend fallback.

## Data honesty
The live telemetry is still simulated. The ML training dataset is simulated. The system is therefore a functional SIH prototype architecture, not a production Indian Railways live-data integration.
