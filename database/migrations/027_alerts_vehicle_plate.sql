-- 027_alerts_vehicle_plate.sql
-- Record the confirmed number plate on vehicle-triggered alerts. The AI Risk
-- Engine attaches plateText to VEHICLE risk observations; the Alert Manager
-- persists it here so operators can see which car caused the alert and the
-- plate snapshot evidence (PLATE / VEHICLE) can be anchored to the alert.
ALTER TABLE alerts
  ADD COLUMN vehicle_plate VARCHAR(32) NULL AFTER risk_score,
  ADD KEY idx_alerts_vehicle_plate (vehicle_plate);