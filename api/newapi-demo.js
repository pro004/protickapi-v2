const meta = {
  name: "Demo New API",
  description: "This is a demonstration of auto-detection for new APIs",
  path: "/demo-new",
  method: "get",
  author: "Xrotick",
  category: "demo"
};

async function onStart({ req, res }) {
  res.json({
    status: "success",
    message: "This new API was automatically detected and tracked!",
    timestamp: new Date().toISOString(),
    requestCount: "Check the /api/stats endpoint to see the tracking"
  });
}

module.exports = { meta, onStart };