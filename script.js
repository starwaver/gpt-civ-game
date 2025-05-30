document.addEventListener('DOMContentLoaded', () => {
    // CONFIG
    const CFG = {
        ROWS: 100,
        COLS: 100,
        TILE: 40,
        TERRAIN: ['grass', 'forest', 'water', 'mountain'],
        COST: { grass: 1, forest: 2, water: Infinity, mountain: 3, FOUND_CITY: 5, SPAWN_UNIT: 3 },
        YIELD: { grass: 1, forest: 1, water: 0, mountain: 0 },
        CITY_CD: 5
    };

    // STATE
    const Game = {
        grid: [],
        units: [],
        selected: null,
        turn: 0,
        player: { food: 0 },
        dirtyTiles: new Set(), // Tiles that need re-rendering
        cities: [] // Array of city tile objects
    };

    // DOM Elements (remains the same)
    const DOM = {
        mapEl: document.getElementById('map'),
        worldEl: document.getElementById('world'),
        turnEl: document.getElementById('turn'),
        foodEl: document.getElementById('food'),
        unitsEl: document.getElementById('units'),
        endBtn: document.getElementById('endBtn'),
        centerBtn: document.getElementById('centerBtn')
    };

    // UTILS (remains the same)
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
        renderTile: (tile) => { // Logic remains the same
            if (!tile || !tile.div) return;
            let html = '';
            if (tile.city) html += '<span class="cityIcon">🏰</span>';
            if (tile.unit) html += '<span class="unitIcon">★</span>';
            tile.div.innerHTML = html;

            tile.div.classList.toggle('city', tile.city);
            tile.div.classList.toggle('unit', !!tile.unit);
            tile.div.classList.toggle('selected', Game.selected && tile.unit === Game.selected);
            tile.div.classList.toggle('visited-tile', tile.visited);
            if (tile.city) {
                const isReady = Game.turn - tile.last >= CFG.CITY_CD && Game.player.food >= CFG.COST.SPAWN_UNIT;
                tile.div.classList.toggle('ready', isReady);
            } else {
                tile.div.classList.remove('ready'); // Ensure not ready if not a city
            }
        },
        // MODIFIED: Replaced renderAll with renderDirtyTiles
        renderDirtyTiles: () => {
            Game.dirtyTiles.forEach(tile => {
                Renderer.renderTile(tile);
            });
            Game.dirtyTiles.clear();
        },
        updateHUD: () => { // Logic remains the same
            DOM.turnEl.textContent = Game.turn;
            DOM.foodEl.textContent = Game.player.food;
            DOM.unitsEl.textContent = Game.units.length;
        }
    };

    // ACTIONS
    const Actions = {
        endTurn: () => {
            Game.turn++;
            
            // Add all cities to dirtyTiles because their 'ready' status might change due to turn increment.
            // Food changes affecting 'ready' status are handled when player.food updates.
            Game.cities.forEach(cityTile => Game.dirtyTiles.add(cityTile));

            Renderer.updateHUD();
            Renderer.renderDirtyTiles(); // Render only changed tiles
        },
        selectUnit: (unit) => {
            const oldSelectedUnit = Game.selected;

            if (oldSelectedUnit) {
                const oldTile = Utils.getTile(oldSelectedUnit.r, oldSelectedUnit.c);
                if (oldTile) Game.dirtyTiles.add(oldTile);
            }

            Game.selected = unit;

            if (unit) {
                const newTile = Utils.getTile(unit.r, unit.c);
                if (newTile) Game.dirtyTiles.add(newTile);
            }
            // Immediate render for selection responsiveness if not ending turn
            // However, typical actions after selection will end the turn.
            // If selecting a unit and doing nothing else felt laggy, we'd call renderDirtyTiles here.
            // For now, assume an action follows selection.
        },
        addUnit: (r, c) => {
            const tile = Utils.getTile(r, c);
            if (!tile || tile.unit || CFG.COST[tile.terr] === Infinity) {
                return false;
            }
            const unit = { r, c };
            Game.units.push(unit);
            tile.unit = unit;

            if (!tile.visited) {
                tile.visited = true;
            }
            Game.dirtyTiles.add(tile); // Mark tile dirty
            Renderer.updateHUD(); // updateHUD is quick
            return true;
        },
        foundCity: (unit) => {
            const tile = Utils.getTile(unit.r, unit.c);
            if (!tile || tile.city || Game.player.food < CFG.COST.FOUND_CITY) return;

            const oldFood = Game.player.food;
            Game.player.food -= CFG.COST.FOUND_CITY;
            tile.city = true;
            tile.last = Game.turn;
            tile.unit = null;

            Game.units = Game.units.filter(u => u !== unit);
            if (Game.selected === unit) Game.selected = null;
            
            if (!Game.cities.includes(tile)) { // Add to cities list
                Game.cities.push(tile);
            }
            Game.dirtyTiles.add(tile); // Mark tile dirty

            // If food change affects city readiness, mark all cities dirty
            if (Game.player.food !== oldFood) {
                Game.cities.forEach(city => Game.dirtyTiles.add(city));
            }

            Actions.endTurn();
        },
        spawnUnitFromCity: (cityTile) => {
            if (!cityTile.city || Game.turn - cityTile.last < CFG.CITY_CD || Game.player.food < CFG.COST.SPAWN_UNIT) return;

            const cityR = +cityTile.div.dataset.r;
            const cityC = +cityTile.div.dataset.c;
            let spawnR = -1, spawnC = -1;

            if (!cityTile.unit && CFG.COST[cityTile.terr] < Infinity) {
                spawnR = cityR;
                spawnC = cityC;
            } else {
                const emptyNeighbor = Utils.getNeighbors(cityR, cityC).find(([nr, nc]) => {
                    const neighborTile = Utils.getTile(nr, nc);
                    return neighborTile && !neighborTile.unit && CFG.COST[neighborTile.terr] < Infinity;
                });
                if (emptyNeighbor) { [spawnR, spawnC] = emptyNeighbor; } 
                else { return; }
            }

            if (spawnR !== -1) {
                const oldFood = Game.player.food;
                if (Actions.addUnit(spawnR, spawnC)) { // addUnit marks its tile dirty and updates HUD
                    Game.player.food -= CFG.COST.SPAWN_UNIT;
                    cityTile.last = Game.turn;
                    Game.dirtyTiles.add(cityTile); // Mark city tile dirty (for 'last' and potentially 'ready' status)
                    
                    if (Game.player.food !== oldFood) { // Food changed
                        Game.cities.forEach(city => Game.dirtyTiles.add(city));
                    }
                    // Renderer.updateHUD(); // addUnit already calls it.
                    Actions.endTurn(); // MODIFIED: Spawning unit now ends the turn
                }
            }
        },
        moveUnit: (unit, r, c) => {
            const fromTile = Utils.getTile(unit.r, unit.c);
            const toTile = Utils.getTile(r, c);

            if (!toTile || CFG.COST[toTile.terr] === Infinity) return;

            if (fromTile) {
                fromTile.unit = null;
                Game.dirtyTiles.add(fromTile); // Mark dirty
            }

            unit.r = r;
            unit.c = c;
            toTile.unit = unit;

            const oldFood = Game.player.food;
            if (!toTile.visited) {
                Game.player.food += CFG.YIELD[toTile.terr];
                toTile.visited = true;
            }
            Game.dirtyTiles.add(toTile); // Mark dirty

            if (Game.player.food !== oldFood) { // Food changed
                Game.cities.forEach(city => Game.dirtyTiles.add(city));
            }
            // updateHUD will be called by endTurn
            Actions.endTurn();
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
                    const tileObj = {
                        terr: terrain, div: div, unit: null, city: false, last: 0, visited: false
                    };
                    Game.grid[r][c] = tileObj;
                    Game.dirtyTiles.add(tileObj); // Add all tiles for initial render
                }
            }
        }
    };

    // Map Panning State (remains the same)
    const MapPanning = {
        isDragging: false, startX: 0, startY: 0, scrollLeftStart: 0, scrollTopStart: 0
    };

    // EVENT HANDLERS (logic mostly same, calls to actions are what matter)
    const EventHandlers = {
        handleWorldClick: (e) => {
            const tileElement = e.target.closest('.tile');
            if (!tileElement) return;
            const r = +tileElement.dataset.r;
            const c = +tileElement.dataset.c;
            const clickedTile = Utils.getTile(r, c);
            if (!clickedTile) return;

            if (clickedTile.unit) {
                if (Game.selected === clickedTile.unit) { Actions.foundCity(clickedTile.unit); } 
                else { Actions.selectUnit(clickedTile.unit); Renderer.renderDirtyTiles(); /* Immediate visual feedback for selection */ }
                return;
            }
            if (clickedTile.city) { Actions.spawnUnitFromCity(clickedTile); return; }
            if (!Game.selected) return;
            const isNeighbor = Utils.getNeighbors(Game.selected.r, Game.selected.c).some(([nr, nc]) => nr === r && nc === c);
            if (!isNeighbor || CFG.COST[clickedTile.terr] === Infinity) return;
            Actions.moveUnit(Game.selected, r, c);
        },
        handleMapMouseDown: (e) => { /* ... same ... */
            MapPanning.isDragging = true; MapPanning.startX = e.clientX; MapPanning.startY = e.clientY;
            MapPanning.scrollLeftStart = DOM.mapEl.scrollLeft; MapPanning.scrollTopStart = DOM.mapEl.scrollTop;
            DOM.mapEl.classList.add('dragging');
        },
        handleWindowMouseMove: (e) => { /* ... same ... */
            if (!MapPanning.isDragging) return;
            DOM.mapEl.scrollLeft = MapPanning.scrollLeftStart + (MapPanning.startX - e.clientX);
            DOM.mapEl.scrollTop = MapPanning.scrollTopStart + (MapPanning.startY - e.clientY);
        },
        handleWindowMouseUp: () => { /* ... same ... */
            if (MapPanning.isDragging) { MapPanning.isDragging = false; DOM.mapEl.classList.remove('dragging');}
        },
        handleEndTurnClick: Actions.endTurn,
        handleCenterViewClick: () => { /* ... same, selectUnit will mark dirty ... */
            let unitToCenter = Game.selected;
            if (!unitToCenter && Game.units.length > 0) { unitToCenter = Game.units[0]; }
            if (unitToCenter) {
                Utils.centerOn(unitToCenter.r, unitToCenter.c);
                Actions.selectUnit(unitToCenter); // Marks tiles dirty
                Renderer.renderDirtyTiles(); // Immediate visual feedback for selection/centering
            }
        }
    };

    // INITIALIZATION
    function init() {
        document.documentElement.style.setProperty('--tile', `${CFG.TILE}px`);

        World.buildGrid(); // Populates Game.dirtyTiles with all tiles

        const startR = Math.floor(CFG.ROWS / 2);
        const startC = Math.floor(CFG.COLS / 2);
        
        Actions.addUnit(startR, startC); // Marks its tile dirty

        if (Game.units.length > 0) {
            Actions.selectUnit(Game.units[0]); // Marks its tile dirty
        }

        Renderer.updateHUD();
        Renderer.renderDirtyTiles(); // Initial render of all (dirty) tiles
        Utils.centerOn(startR, startC);

        // Attach event listeners (remains the same)
        DOM.worldEl.addEventListener('click', EventHandlers.handleWorldClick);
        DOM.mapEl.addEventListener('mousedown', EventHandlers.handleMapMouseDown);
        window.addEventListener('mousemove', EventHandlers.handleWindowMouseMove);
        window.addEventListener('mouseup', EventHandlers.handleWindowMouseUp);
        DOM.endBtn.addEventListener('click', EventHandlers.handleEndTurnClick);
        DOM.centerBtn.addEventListener('click', EventHandlers.handleCenterViewClick);
    }

    init();
});
