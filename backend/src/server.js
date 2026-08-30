const app = require("./app");
const env = require("./config/env");

const PORT = env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`IBVAP backend listening on port ${PORT}`);
});
