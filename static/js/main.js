// --- Configuration & Constants ---
const API_KEY = 'Av2yFT5fzULR4Z8xODQvnuwtOLg1kigBW3Uq8ag0'; // Get your own at api.nasa.gov
const BASE_URL = 'https://api.nasa.gov/neo/rest/v1/feed';

// Human-scale Comparison Constants
const MOON_DISTANCE_KM = 384400;
const EIFFEL_TOWER_HEIGHT = 330; // meters
const BOEING_747_LENGTH = 70;    // meters
const FOOTBALL_FIELD_LENGTH = 110; // meters

// --- State Management ---
let asteroids = [];
// Watchlist stored as array of asteroid ids
let watchlist = [];

// --- Initialization ---
function init() {
    // Skip on admin page (uses admin.js; main page needs #loading and #asteroid-container)
    const container = document.getElementById('asteroid-container');
    const loading = document.getElementById('loading');
    if (!container || !loading) return;

    // initialize date inputs with today
    const todayStr = new Date().toISOString().split('T')[0];
    const sd = document.getElementById('start-date');
    const ed = document.getElementById('end-date');
    
    if (sd) sd.value = todayStr;
    if (ed) ed.value = todayStr;

    // default fetch uses selected dates (or today)
    const startVal = sd ? sd.value : todayStr;
    const endVal = ed ? ed.value : todayStr;
    fetchAsteroidData(startVal, endVal);

    // init watchlist from storage and wire UI
    loadWatchlistFromStorage();
    updateWatchlistUI();

    // Wire refresh button
    const refresh = document.getElementById('refresh-btn');
    if (refresh) {
        refresh.addEventListener('click', () => {
            const sdVal = document.getElementById('start-date')?.value || null;
            const edVal = document.getElementById('end-date')?.value || null;
            fetchAsteroidData(sdVal, edVal);
        });
    }
    
    // Wire filter
    const filter = document.getElementById('filter-risk');
    if (filter) filter.addEventListener('change', renderAsteroids);
    
    // Wire sort
    const sort = document.getElementById('sort-by');
    if (sort) sort.addEventListener('change', renderAsteroids);
    
    // Wire date search button
    const dateBtn = document.getElementById('date-search-btn');
    if (dateBtn) {
        dateBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const sdVal = document.getElementById('start-date')?.value;
            const edVal = document.getElementById('end-date')?.value;
            console.log('Date search clicked:', sdVal, edVal);
            fetchAsteroidData(sdVal || null, edVal || null);
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// --- Data Fetching ---
async function fetchAsteroidData(startDate = null, endDate = null) {
    const loading = document.getElementById('loading');
    const container = document.getElementById('asteroid-container');
    
    loading.style.display = 'flex';
    container.innerHTML = '';

    try {
        const today = new Date().toISOString().split('T')[0];
        const start = startDate || today;
        const end = endDate || start;

        // validate date order
        let sDate = new Date(start);
        let eDate = new Date(end);
        if (eDate < sDate) {
            // swap
            const tmp = sDate; sDate = eDate; eDate = tmp;
        }

        // limit to 7-day window (API restriction)
        const maxWindowDays = 7;
        const diffDays = Math.floor((eDate - sDate) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > maxWindowDays) {
            // clamp end date
            const clampedEnd = new Date(sDate);
            clampedEnd.setDate(clampedEnd.getDate() + (maxWindowDays - 1));
            eDate = clampedEnd;
        }

        const sStr = sDate.toISOString().split('T')[0];
        const eStr = eDate.toISOString().split('T')[0];

        const response = await fetch(`${BASE_URL}?start_date=${sStr}&end_date=${eStr}&api_key=${API_KEY}`);
        const data = await response.json();

        // Flatten the NASA object into a clean array across the date range
        const rawList = Object.values(data.near_earth_objects || {}).flat();
        asteroids = processAsteroidData(rawList);
        
        updateSummaryStats();
        renderAsteroids();
        postFetchRefresh();
        document.getElementById('last-updated').textContent = sStr === eStr ? `${sStr} ${new Date().toLocaleTimeString()}` : `${sStr} → ${eStr} ${new Date().toLocaleTimeString()}`;
    } catch (error) {
        console.error("Error fetching space data:", error);
        container.innerHTML = `<p class='error'>Failed to load cosmic data. Please check connection.</p>`;
    } finally {
        loading.style.display = 'none';
    }
}

// After fetching, refresh alerts and watchlist display
function postFetchRefresh() {
    // populate alerts for hazardous asteroids
    const alertsEl = document.getElementById('alerts');
    if (alertsEl) alertsEl.innerHTML = '';
    asteroids.filter(a => a.isHazardous).forEach(a => showAlert(`⚠️ ${a.name} may be hazardous — passes ${a.moonUnits} moons away`));

    // update watchlist UI (now that asteroid details are available)
    updateWatchlistUI();
}

// --- Logic: Data Processing (The "Enthusiast" Logic) ---
function processAsteroidData(list) {
    return list.map(item => {
        const diameter = item.estimated_diameter.meters.estimated_diameter_max;
        const missDistance = parseFloat(item.close_approach_data[0].miss_distance.kilometers);
        const velocity = parseFloat(item.close_approach_data[0].relative_velocity.kilometers_per_hour);
        const isHazardous = item.is_potentially_hazardous_asteroid;

        return {
            id: item.id,
            name: item.name.replace('(', '').replace(')', ''), // Human-friendly name
            diameter: diameter,
            velocity: velocity,
            missDistance: missDistance,
            isHazardous: isHazardous,
            riskLevel: isHazardous ? 'high' : (diameter > 100 ? 'medium' : 'low'),
            
            // "Moon Units" Logic
            moonUnits: (missDistance / MOON_DISTANCE_KM).toFixed(1),
            
            // "Human-Scale" Comparison Logic
            sizeComparison: getSizeComparison(diameter),
            
            // "Speed in Cars/Time" Logic
            speedNote: `Fast enough to cross the USA in ${((4500 / velocity) * 60).toFixed(1)} mins`
        };
    });
}

function getSizeComparison(meters) {
    if (meters > EIFFEL_TOWER_HEIGHT) return `Taller than the Eiffel Tower`;
    if (meters > FOOTBALL_FIELD_LENGTH) return `Larger than a Football Field`;
    return `As big as ${Math.round(meters / BOEING_747_LENGTH)} Boeing 747s`;
}

// --- UI: Rendering ---
function renderAsteroids() {
    const container = document.getElementById('asteroid-container');
    const filter = document.getElementById('filter-risk').value;
    const sortBy = document.getElementById('sort-by').value;

    let filtered = asteroids.filter(a => filter === 'all' || a.riskLevel === filter);

    // Sorting
    filtered.sort((a, b) => {
        if (sortBy === 'distance') return a.missDistance - b.missDistance;
        if (sortBy === 'size') return b.diameter - a.diameter;
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        document.getElementById('empty-state').style.display = 'block';
        container.innerHTML = '';
        return;
    }

    document.getElementById('empty-state').style.display = 'none';
    container.innerHTML = filtered.map(a => `
        <article class="asteroid-card ${a.riskLevel}">
            <div class="card-header">
                <h3>${a.name}</h3>
                <span class="badge badge-${a.riskLevel}">
                    ${a.isHazardous ? '⚠️ High Interest' : '✅ Safe Flyby'}
                </span>
            </div>
            
            <div class="card-body">
                <div class="stat-row">
                    <span class="stat-icon">📏</span>
                    <div>
                        <p class="stat-val">${a.sizeComparison}</p>
                        <p class="stat-label">Actual: ${Math.round(a.diameter)} meters</p>
                    </div>
                </div>

                <div class="stat-row">
                    <span class="stat-icon">🌑</span>
                    <div>
                        <p class="stat-val">Passes ${a.moonUnits} Moons away</p>
                        <p class="stat-label">Distance: ${Math.round(a.missDistance).toLocaleString()} km</p>
                    </div>
                </div>

                <div class="stat-row">
                    <span class="stat-icon">🚀</span>
                    <div>
                        <p class="stat-val">${Math.round(a.velocity).toLocaleString()} km/h</p>
                        <p class="stat-label">${a.speedNote}</p>
                    </div>
                </div>
            </div>
            
            <button class="watchlist-btn" onclick="toggleWatchlist('${a.id}')">⭐ Add to Watchlist</button>
        </article>
    `).join('');

    // ensure watchlist and alerts reflect current data
    updateWatchlistUI();
}

function updateSummaryStats() {
    document.getElementById('high-count').textContent = asteroids.filter(a => a.riskLevel === 'high').length;
    document.getElementById('medium-count').textContent = asteroids.filter(a => a.riskLevel === 'medium').length;
    document.getElementById('low-count').textContent = asteroids.filter(a => a.riskLevel === 'low').length;
    document.getElementById('total-count').textContent = asteroids.length;
}

function toggleWatchlist(id) {
    const idx = watchlist.indexOf(id);
    if (idx === -1) {
        watchlist.push(id);
        saveWatchlistToStorage();
        updateWatchlistUI();
        const a = asteroids.find(x => x.id === id);
        showAlert(`⭐ ${a ? a.name : id} added to watchlist`);
    } else {
        // remove
        watchlist.splice(idx, 1);
        saveWatchlistToStorage();
        updateWatchlistUI();
        const a = asteroids.find(x => x.id === id);
        showAlert(`🗑️ ${a ? a.name : id} removed from watchlist`);
    }
}

function loadWatchlistFromStorage() {
    try {
        const raw = localStorage.getItem('cw_watchlist');
        watchlist = raw ? JSON.parse(raw) : [];
    } catch (e) { watchlist = []; }
}

function saveWatchlistToStorage() {
    try { localStorage.setItem('cw_watchlist', JSON.stringify(watchlist)); } catch (e) {}
}

function updateWatchlistUI() {
    const listEl = document.getElementById('watchlist');
    if (!listEl) return;
    if (!watchlist || watchlist.length === 0) {
        listEl.innerHTML = '<li style="color: var(--color-text-muted); font-style: italic; border: none;">No asteroids tracked yet</li>';
        return;
    }
    // build entries using available asteroid data
    listEl.innerHTML = watchlist.map(id => {
        const a = asteroids.find(x => x.id === id);
        const name = a ? a.name : id;
        return `<li>⭐ ${name} <button style="margin-left:8px;" onclick="(function(id){toggleWatchlist(id)} )('${id}')">Remove</button></li>`;
    }).join('');
}

function showAlert(msg) {
    const alertsEl = document.getElementById('alerts');
    if (!alertsEl) return;
    const li = document.createElement('li');
    li.textContent = msg;
    alertsEl.prepend(li);
}