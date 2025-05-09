/** map functions */

PETRA.TERRITORY_PLAYER_MASK = 0x1F;
PETRA.TERRITORY_BLINKING_MASK = 0x40;

PETRA.createObstructionMap = function(gameState, accessIndex, template)
{
	const passabilityMap = gameState.getPassabilityMap();
	const territoryMap = gameState.ai.territoryMap;
	const ratio = territoryMap.cellSize / passabilityMap.cellSize;

	// default values
	let placementType = "land";
	let buildOwn = true;
	let buildAlly = true;
	let buildNeutral = true;
	let buildEnemy = false;
	// If there is a template then replace the defaults
	if (template)
	{
		placementType = template.buildPlacementType();
		buildOwn = template.hasBuildTerritory("own");
		buildAlly = template.hasBuildTerritory("ally");
		buildNeutral = template.hasBuildTerritory("neutral");
		buildEnemy = template.hasBuildTerritory("enemy");
	}
	const obstructionTiles = new Uint8Array(passabilityMap.data.length);

	let passMap;
	let obstructionMask;
	if (placementType == "shore")
	{
		passMap = gameState.ai.accessibility.navalPassMap;
		obstructionMask = gameState.getPassabilityClassMask("building-shore");
	}
	else
	{
		passMap = gameState.ai.accessibility.landPassMap;
		obstructionMask = gameState.getPassabilityClassMask("building-land");
	}

	for (let k = 0; k < territoryMap.data.length; ++k)
	{
		const tilePlayer = territoryMap.data[k] & PETRA.TERRITORY_PLAYER_MASK;
		const isConnected = (territoryMap.data[k] & PETRA.TERRITORY_BLINKING_MASK) == 0;
		if (tilePlayer === PlayerID)
		{
			if (!buildOwn || !buildNeutral && !isConnected)
				continue;
		}
		else if (gameState.isPlayerMutualAlly(tilePlayer))
		{
			if (!buildAlly || !buildNeutral && !isConnected)
				continue;
		}
		else if (tilePlayer === 0)
		{
			if (!buildNeutral)
				continue;
		}
		else
		{
			if (!buildEnemy)
				continue;
		}

		const x = ratio * (k % territoryMap.width);
		const y = ratio * Math.floor(k / territoryMap.width);
		for (let ix = 0; ix < ratio; ++ix)
		{
			for (let iy = 0; iy < ratio; ++iy)
			{
				const i = x + ix + (y + iy)*passabilityMap.width;
				if (placementType != "shore" && accessIndex && accessIndex !== passMap[i])
					continue;
				if (!(passabilityMap.data[i] & obstructionMask))
					obstructionTiles[i] = 255;
			}
		}
	}

	const map = new API3.Map(gameState.sharedScript, "passability", obstructionTiles);
	map.setMaxVal(255);

	if (template && template.buildDistance())
	{
		const distance = template.buildDistance();
		let minDist = distance.MinDistance ? +distance.MinDistance : 0;
		if (minDist)
		{
			const obstructionRadius = template.obstructionRadius();
			if (obstructionRadius)
				minDist -= obstructionRadius.min;
			const fromClass = distance.FromClass;
			const cellSize = passabilityMap.cellSize;
			const cellDist = 1 + minDist / cellSize;
			const structures = gameState.getOwnStructures().filter(API3.Filters.byClass(fromClass));
			for (const ent of structures.values())
			{
				if (!ent.position())
					continue;
				const pos = ent.position();
				const x = Math.round(pos[0] / cellSize);
				const z = Math.round(pos[1] / cellSize);
				map.addInfluence(x, z, cellDist, -255, "constant");
			}
		}
	}

	return map;
};


PETRA.createTerritoryMap = function(gameState)
{
	const map = gameState.ai.territoryMap;

	const ret = new API3.Map(gameState.sharedScript, "territory", map.data);
	ret.getOwner = function(p) { return this.point(p) & PETRA.TERRITORY_PLAYER_MASK; };
	ret.getOwnerIndex = function(p) { return this.map[p] & PETRA.TERRITORY_PLAYER_MASK; };
	ret.isBlinking = function(p) { return (this.point(p) & PETRA.TERRITORY_BLINKING_MASK) != 0; };
	return ret;
};

/**
 *  The borderMap contains some border and frontier information:
 *  - border of the map filled once:
 *     - all mini-cells (1x1) from the big cell (8x8) inaccessibles => bit 0
 *     - inside a given distance to the border                      => bit 1
 *  - frontier of our territory (updated regularly in updateFrontierMap)
 *     - narrow border (inside our territory)                       => bit 2
 *     - large border (inside our territory, exclusive of narrow)   => bit 3
 */

PETRA.outside_Mask = 1;
PETRA.border_Mask = 2;
PETRA.fullBorder_Mask = PETRA.outside_Mask | PETRA.border_Mask;
PETRA.narrowFrontier_Mask = 4;
PETRA.largeFrontier_Mask = 8;
PETRA.fullFrontier_Mask = PETRA.narrowFrontier_Mask | PETRA.largeFrontier_Mask;

PETRA.createBorderMap = function(gameState)
{
	const map = new API3.Map(gameState.sharedScript, "territory");
	const width = map.width;
	const border = Math.round(80 / map.cellSize);
	const passabilityMap = gameState.getPassabilityMap();
	const obstructionMask = gameState.getPassabilityClassMask("unrestricted");
	if (gameState.circularMap)
	{
		const ic = (width - 1) / 2;
		const radcut = (ic - border) * (ic - border);
		for (let j = 0; j < map.length; ++j)
		{
			const dx = j%width - ic;
			const dy = Math.floor(j/width) - ic;
			const radius = dx*dx + dy*dy;
			if (radius < radcut)
				continue;
			map.map[j] = PETRA.outside_Mask;
			const ind = API3.getMapIndices(j, map, passabilityMap);
			for (const k of ind)
			{
				if (passabilityMap.data[k] & obstructionMask)
					continue;
				map.map[j] = PETRA.border_Mask;
				break;
			}
		}
	}
	else
	{
		const borderCut = width - border;
		for (let j = 0; j < map.length; ++j)
		{
			const ix = j%width;
			const iy = Math.floor(j/width);
			if (ix < border || ix >= borderCut || iy < border || iy >= borderCut)
			{
				map.map[j] = PETRA.outside_Mask;
				const ind = API3.getMapIndices(j, map, passabilityMap);
				for (const k of ind)
				{
					if (passabilityMap.data[k] & obstructionMask)
						continue;
					map.map[j] = PETRA.border_Mask;
					break;
				}
			}
		}
	}

	// map.dumpIm("border.png", 5);
	return map;
};

PETRA.debugMap = function(gameState, map)
{
	const width = map.width;
	const cell = map.cellSize;
	gameState.getEntities().forEach(ent => {
		const pos = ent.position();
		if (!pos)
			return;
		const x = Math.round(pos[0] / cell);
		const z = Math.round(pos[1] / cell);
		const id = x + width*z;
		if (map.map[id] == 1)
			Engine.PostCommand(PlayerID, { "type": "set-shading-color", "entities": [ent.id()], "rgb": [2, 0, 0] });
		else if (map.map[id] == 2)
			Engine.PostCommand(PlayerID, { "type": "set-shading-color", "entities": [ent.id()], "rgb": [0, 2, 0] });
		else if (map.map[id] == 3)
			Engine.PostCommand(PlayerID, { "type": "set-shading-color", "entities": [ent.id()], "rgb": [0, 0, 2] });
	});
};
