#!/usr/bin/env bash
# Launch Customer and Partner apps in two phone-dimensioned standalone simulator windows side-by-side

echo "📱 Launching ParkPilot Customer & Partner Mobile Simulators..."

google-chrome --app="http://localhost:8081" \
  --window-size=420,890 \
  --window-position=120,80 \
  --user-data-dir=/tmp/parkpilot_customer_sim \
  --disable-features=Translate \
  > /dev/null 2>&1 &

google-chrome --app="http://localhost:8082" \
  --window-size=420,890 \
  --window-position=580,80 \
  --user-data-dir=/tmp/parkpilot_partner_sim \
  --disable-features=Translate \
  > /dev/null 2>&1 &

echo "✨ Both simulators launched side-by-side! Ready for your demo video."
