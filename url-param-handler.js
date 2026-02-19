// frontend/src/App.jsx - Add URL Parameter Handling
// Add this useEffect in your MainApp component to auto-detect kiosk_id from URL

function MainApp() {
  const { user, signOut, getAuthHeader } = useAuth();
  
  const [status, setStatus] = useState('IDLE');
  const [config, setConfig] = useState(null);
  // ... other state

  // ===== ADD THIS: Auto-detect kiosk_id from URL =====
  useEffect(() => {
    // Check if kiosk_id is in URL parameters
    const params = new URLSearchParams(window.location.search);
    const kioskIdFromUrl = params.get('kiosk_id');
    
    if (kioskIdFromUrl) {
      // Auto-fill kiosk configuration from URL
      setConfig({ 
        kiosk_id: kioskIdFromUrl 
      });
      setStatus('SCANNED');
      addLog(`Auto-connected to kiosk: ${kioskIdFromUrl}`);
      
      // Optional: Clean up URL to remove parameter
      // window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // Run once on mount
  // ===== END ADD =====

  // Rest of your component code...
}

// ALTERNATIVE: If you want to also support hash parameters (#kiosk_id=xxx)
useEffect(() => {
  // Check URL search params (?kiosk_id=xxx)
  const searchParams = new URLSearchParams(window.location.search);
  let kioskId = searchParams.get('kiosk_id');
  
  // Also check hash params (#kiosk_id=xxx)
  if (!kioskId) {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    kioskId = hashParams.get('kiosk_id');
  }
  
  if (kioskId) {
    setConfig({ kiosk_id: kioskId });
    setStatus('SCANNED');
    addLog(`Auto-connected to kiosk: ${kioskId}`);
  }
}, []);

// TESTING:
// Visit: http://localhost:5173?kiosk_id=test_kiosk
// Should auto-skip scanner and go to "Connect" view
