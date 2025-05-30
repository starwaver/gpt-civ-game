document.addEventListener('DOMContentLoaded', () => {
    // CONFIG
    const CFG = {
        ROWS: 100,
        COLS: 100,
        TILE: 40,
        TERRAIN: ['grass', 'forest', 'water', 'mountain'],
        COST: { grass: 1, forest: 2, water: Infinity, mountain: 3, FOUND_CITY: 5, SPAWN_UNIT: 3 },
        YIELD: { grass: 1, forest: 1, water: 0, mountain: 0 },
        CITY_CD: 5 // City cooldown in turns to produce a new unit
    };

    // STATE
    const Game = {
        grid: [],    // 2D array of tile objects
        units: [],   // Array of unit objects {r, c}
        selected: null, // Currently selected unit object
        turn: 0,
        player: { food: 0 }
    };

    // DOM Elements
    const DOM = {
        mapEl: document.getElementById('map'),
        worldEl: document.getElementById('world'),
        turnEl: document.getElementById('turn'),
        foodEl: document.getElementById('food'),
        unitsEl: document.getElementById('units'),
        endBtn: document.getElementById('endBtn'),
        centerBtn: document.getElementById('centerBtn')
    };

    // UTILS
    const Utils = {
        randItem: arr => arr[Math.floor(Math.random() * arr.length)],
        isInBounds: (r, c) => r >= 0 && r < CFG.ROWS && c >= 0 && c < CFG.COLS,
        getTile: (r, c) => Utils.isInBounds(r, c) ? Game.grid[r][c] : null,
        getNeighbors: (r, c) => [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
            .filter(([nr, nc]) => Utils.isInBounds(nr, nc)),
        centerOn: (r, c) => {
            if (!Utils.isInBounds(r, c)) return;
            DOM.mapEl.scrollLeft = c * CFG.TILE + CFG.TILE / 2 - DOM.mapEl.clientWidth / 2;
            DOM.mapEl.scrollTop = r * CFG.TILE + CFG.TILE / 2 - DOM.mapEl.clientHeight / 2;
        }
    };

    // RENDERER
    const Renderer = {
        renderTile: (tile) => {
            if (!tile || !tile.div) return;
            let html = '';
            if (tile.city) html += '<span class="cityIcon">🏰</span>';
            if (tile.unit) html += '<span class="unitIcon">★</span>';
            tile.div.innerHTML = html;

            tile.div.classList.toggle('city', tile.city);
            tile.div.classList.toggle('unit', !!tile.unit);
            tile.div.classList.toggle('selected', Game.selected && tile.unit === Game.selected);
            // Apply 'visited-tile' class if the tile has been visited
            tile.div.classList.toggle('visited-tile', tile.visited); 
            if (tile.city) {
                const isReady = Game.turn - tile.last >= CFG.CITY_CD && Game.player.food >= CFG.COST.SPAWN_UNIT;
                tile.div.classList.toggle('ready', isReady);
            }
        },
        renderAll: () => {
            for (let r = 0; r < CFG.ROWS; r++) {
                for (let c = 0; c < CFG.COLS; c++) {
                    Renderer.renderTile(Game.grid[r][c]);
                }
            }
        },
        updateHUD: () => {
            DOM.turnEl.textContent = Game.turn;
            DOM.foodEl.textContent = Game.player.food;
            DOM.unitsEl.textContent = Game.units.length;
        }
    };

    // ACTIONS
    const Actions = {
        endTurn: () => {
            Game.turn++;
            Renderer.updateHUD();
            Renderer.renderAll(); // Re-render all to update city readiness, visited status, etc.
        },
        selectUnit: (unit) => {
            const oldSelectedTileObj = Game.selected ? Utils.getTile(Game.selected.r, Game.selected.c) : null;
            Game.selected = unit;
            if (oldSelectedTileObj) Renderer.renderTile(oldSelectedTileObj);
            if (unit) Renderer.renderTile(Utils.getTile(unit.r, unit.c));
        },
        addUnit: (r, c) => {
            const tile = Utils.getTile(r, c);
            if (!tile || tile.unit || CFG.COST[tile.terr] === Infinity) {
                return false; // Cannot add unit on occupied, non-existent, or impassable tile
            }
            const unit = { r, c };
            Game.units.push(unit);
            tile.unit = unit;

            // Mark tile as visited when a unit is added (initial placement or spawn)
            // Food is only gained on *moving* to an unvisited tile as per existing moveUnit logic
            if (!tile.visited) {
                tile.visited = true;
            }

            Renderer.renderTile(tile); // Render tile after unit and visited status are set
            Renderer.updateHUD();
            return true;
        },
        foundCity: (unit) => { // Unit action to become a city
            const tile = Utils.getTile(unit.r, unit.c);
            if (!tile || tile.city || Game.player.food < CFG.COST.FOUND_CITY) return;

            Game.player.food -= CFG.COST.FOUND_CITY;
            tile.city = true;
            tile.last = Game.turn; // Timestamp for city cooldown
            tile.unit = null;    // Unit is consumed

            Game.units = Game.units.filter(u => u !== unit);
            if (Game.selected === unit) Game.selected = null;

            // Tile remains visited, renderTile will handle the class
            Renderer.renderTile(tile);
            // updateHUD is called by endTurn
            Actions.endTurn(); // Founding a city ends the turn
        },
        spawnUnitFromCity: (cityTile) => { // City action to produce a unit
            if (!cityTile.city || Game.turn - cityTile.last < CFG.CITY_CD || Game.player.food < CFG.COST.SPAWN_UNIT) return;

            const cityR = +cityTile.div.dataset.r;
            const cityC = +cityTile.div.dataset.c;
            
            let spawnR = -1, spawnC = -1;

            // Try to spawn on the city tile itself if empty and passable
            if (!cityTile.unit && CFG.COST[cityTile.terr] < Infinity) {
                spawnR = cityR;
                spawnC = cityC;
            } else {
                // Find an adjacent empty and passable tile
                const emptyNeighbor = Utils.getNeighbors(cityR, cityC).find(([nr, nc]) => {
                    const neighborTile = Utils.getTile(nr, nc);
                    return neighborTile && !neighborTile.unit && CFG.COST[neighborTile.terr] < Infinity;
                });
                if (emptyNeighbor) {
                    [spawnR, spawnC] = emptyNeighbor;
                } else {
                    return; // No valid spot to spawn
                }
            }

            if (spawnR !== -1) {
                // Attempt to add unit. addUnit will handle marking the tile as visited.
                if (Actions.addUnit(spawnR, spawnC)) {
                    Game.player.food -= CFG.COST.SPAWN_UNIT;
                    cityTile.last = Game.turn; // Reset cooldown
                    Renderer.renderTile(cityTile); // Update city's 'ready' state
                    Renderer.updateHUD(); 
                }
            }
        },
        moveUnit: (unit, r, c) => {
            const fromTile = Utils.getTile(unit.r, unit.c);
            const toTile = Utils.getTile(r, c);

            if (!toTile || CFG.COST[toTile.terr] === Infinity) return; // Should be caught by click handler, but defensive

            if (fromTile) {
                fromTile.unit = null;
                Renderer.renderTile(fromTile);
            }

            unit.r = r;
            unit.c = c;
            toTile.unit = unit;

            if (!toTile.visited) {
                Game.player.food += CFG.YIELD[toTile.terr];
                toTile.visited = true; // Mark as visited and collect yield
            }
            Renderer.renderTile(toTile); // Will apply visited style
            // updateHUD is called by endTurn
            Actions.endTurn(); // Moving a unit ends the turn
        }
    };

    // WORLD SETUP
    const World = {
        buildGrid: () => {
            DOM.worldEl.style.width = `${CFG.COLS * CFG.TILE}px`;
            DOM.worldEl.style.height = `${CFG.ROWS * CFG.TILE}px`;
            Game.grid = [];

            for (let r = 0; r < CFG.ROWS; r++) {
                Game.grid[r] = [];
                for (let c = 0; c < CFG.COLS; c++) {
                    const terrain = Utils.randItem(CFG.TERRAIN);
                    const div = document.createElement('div');
                    div.className = `tile ${terrain}`;
                    div.style.left = `${c * CFG.TILE}px`;
                    div.style.top = `${r * CFG.TILE}px`;
                    div.dataset.r = r;
                    div.dataset.c = c;
                    DOM.worldEl.appendChild(div);
                    Game.grid[r][c] = {
                        terr: terrain,
                        div: div,
                        unit: null,
                        city: false,
                        last: 0,      // Turn city was last active (founded/spawned unit)
                        visited: false // Initialized to false for visited status
                    };
                }
            }
        }
    };

    // Map Panning State
    const MapPanning = {
        isDragging: false,
        startX: 0,
        startY: 0,
        scrollLeftStart: 0,
        scrollTopStart: 0
    };

    // EVENT HANDLERS
    const EventHandlers = {
        handleWorldClick: (e) => {
            const tileElement = e.target.closest('.tile');
            if (!tileElement) return;

            const r = +tileElement.dataset.r;
            const c = +tileElement.dataset.c;
            const clickedTile = Utils.getTile(r, c);
            if (!clickedTile) return;

            if (clickedTile.unit) { // Clicked on a tile with a unit
                if (Game.selected === clickedTile.unit) {
                    Actions.foundCity(clickedTile.unit); // Try to found city
                } else {
                    Actions.selectUnit(clickedTile.unit); // Select the unit
                }
                return;
            }

            if (clickedTile.city) { // Clicked on a tile with a city (and no unit on it)
                Actions.spawnUnitFromCity(clickedTile);
                return;
            }

            // Clicked on an empty, non-city tile
            if (!Game.selected) return; // No unit selected, cannot move

            const isNeighbor = Utils.getNeighbors(Game.selected.r, Game.selected.c)
                .some(([nr, nc]) => nr === r && nc === c);
            if (!isNeighbor) return; // Not a neighbor

            if (CFG.COST[clickedTile.terr] === Infinity) return; // Impassable terrain

            Actions.moveUnit(Game.selected, r, c);
        },
        handleMapMouseDown: (e) => {
            MapPanning.isDragging = true;
            MapPanning.startX = e.clientX;
            MapPanning.startY = e.clientY;
            MapPanning.scrollLeftStart = DOM.mapEl.scrollLeft;
            MapPanning.scrollTopStart = DOM.mapEl.scrollTop;
            DOM.mapEl.classList.add('dragging');
        },
        handleWindowMouseMove: (e) => {
            if (!MapPanning.isDragging) return;
            DOM.mapEl.scrollLeft = MapPanning.scrollLeftStart + (MapPanning.startX - e.clientX);
            DOM.mapEl.scrollTop = MapPanning.scrollTopStart + (MapPanning.startY - e.clientY);
        },
        handleWindowMouseUp: () => {
            if (MapPanning.isDragging) {
                MapPanning.isDragging = false;
                DOM.mapEl.classList.remove('dragging');
            }
        },
        handleEndTurnClick: Actions.endTurn,
        handleCenterViewClick: () => {
            let unitToCenter = Game.selected;
            if (!unitToCenter && Game.units.length > 0) {
                unitToCenter = Game.units[0]; // Default to the first unit if none selected
            }

            if (unitToCenter) {
                Utils.centerOn(unitToCenter.r, unitToCenter.c);
                Actions.selectUnit(unitToCenter); // Ensure it's (re)selected and visuals are updated
            }
        }
    };

    // INITIALIZATION
    function init() {
        document.documentElement.style.setProperty('--tile', `${CFG.TILE}px`);

        World.buildGrid();

        const startR = Math.floor(CFG.ROWS / 2);
        const startC = Math.floor(CFG.COLS / 2);
        // addUnit will now mark the starting tile as visited
        Actions.addUnit(startR, startC); 

        if (Game.units.length > 0) {
            Actions.selectUnit(Game.units[0]); 
        }

        Renderer.updateHUD();
        Renderer.renderAll(); // Initial full render
        Utils.centerOn(startR, startC);

        // Attach event listeners
        DOM.worldEl.addEventListener('click', EventHandlers.handleWorldClick);
        DOM.mapEl.addEventListener('mousedown', EventHandlers.handleMapMouseDown);
        window.addEventListener('mousemove', EventHandlers.handleWindowMouseMove);
        window.addEventListener('mouseup', EventHandlers.handleWindowMouseUp);
        DOM.endBtn.addEventListener('click', EventHandlers.handleEndTurnClick);
        DOM.centerBtn.addEventListener('click', EventHandlers.handleCenterViewClick);
    }

    init(); // Start the game
});
