-- Display-only browser orientation, independent of the AI pipeline's
-- rotation_degrees column (which rotates frames BEFORE inference/preview).
-- Signed so negative (counter-clockwise) values are valid. The AI engine
-- never reads this column; it only affects how the preview is rendered.
ALTER TABLE cameras
  ADD COLUMN display_rotation_degrees INT NOT NULL DEFAULT 0
  AFTER rotation_degrees;

-- Net displayed orientation = AI rotation_degrees + display_rotation_degrees:
--   CAM-01: AI +90 (landscape-right)  + display 180  -> landscape-left
--   CAM-02: AI +0  (upstream portrait) + display -90  -> landscape-left
UPDATE cameras SET display_rotation_degrees = CASE camera_code
  WHEN 'CAM-01' THEN 180
  WHEN 'CAM-02' THEN -90
  ELSE 0
END
WHERE camera_code IN ('CAM-01', 'CAM-02');