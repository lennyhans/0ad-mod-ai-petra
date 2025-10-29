Started as a fork of [Aegis bot](AegisBot), Petra is the default AI for 0AD since alpha17.

# General structure

When starting a game, the 0AD AI API creates a PetraBot object which inherits from the BaseAI. Then every game turn, PetraBot's OnUpdate() function is called. Then every n turn (presently n = 8 for performance reasons, but could be reduced in the near future) with a shift for each AI player so that they are out of phase, this function calls the update function of the modules constituting the AI. These turns where the AI is updated are called "played turn" in the following.

The Petra AI is currently based on two main modules which are the [#headquarter headquarter] and the [#queueManager queueManager].The first one is responsible for the choice of the different actions performed by the AI while the latter allocates the available resources to these choices by a system of queues with adequate priorities.

All modules must have an update() function, this gets called every n turn that the AI runs. They also have an optional init() function which is called once before the first turn of the AI, once the gameState is available. Futhermore, all the events (i.e. messages sent when an entity is destroyed, renamed, ...) received by the AI in turns where it does not update its modules are kept and concatenated so that none are lost.

# headquarter module

The headquarter module is divided in several sub-modules as attackManager, baseManager, ... which are described below. It is responsible for the development of the civilization (building structures and training units) and the steering of its different sub-modules.

## AttackManager
The attackManager deals with the different attacks. It is mainly a steering function, the real code which handles the training, the preparation and the actual attack is in attackPlan.js. In practise, the attackManager decides on the kind of attack (rush with small number of units, standard attack with medium-size army or attack with a huge army) by creating an attack plan. Then each attack plan defines its target player and the enemy entity which is its primary target. Then it creates build orders (to train the needed units) using three queues (soldiers, champion and siege units). The attack plan may require a transport to attack overseas. Once the primary target is destroyed, the attack plan choose a new target (from the same target player) which is [#accessibility accessible] by land. This continues until either the AI army is destroyed or no new target is found, in which case the army is disbanded.

## BaseManager
Each new cc is the root of a new base, which is governed by its own baseManager. This manager handles workers assigned to that base (for gathering, hunting, fishing, ...) through the file worker.js. It is also responsible for checking base's resources levels, building new dropsites if necessary, repairing its hurt structures.

In addition, an "empty" base is created when starting a game. In principle, all units/buidings are assigned to an "active" base (i.e. a base with an undestroyed cc), and when this cc is destroyed, its units/buildings are assigned to the nearest active one. But when this is not possible (for example when starting a game without cc, or because all ccs have been destroyed), the units/buildings are assigned to the empty base, waiting for the next cc to be build.
This empty base has thus a very limited goal: build a new cc, and if the available resources are not enough, build a dock and accumulates the resources needed to build a cc. And when this is done, all units/buildings are assigned to this new base. The empty base is thus quite different from the inactive bases whose cc has been destroyed and which have then no more use in the game.

The headquarter has an array of all available bases (this.baseManagers) and by convention the empty base is always the first one (this.baseManagers[0]).

## DefenseManager
The defenseManager is responsible for the response to attacks (either directed towards the AI itself or towards its allies).
Each played turn, the defense manager looks for
  * enemy soldiers in range of one of its building
  * enemy units building a cc not far from its border
  * enemy soldiers in range of one allied cc depending on its [#VariabilityofAIstrategy cooperative trait]
Such enemy units found are then grouped inside armies, and the defense manager will try and find the most appropriate units to counter these attacks.

It also deals with garrisoning support units in the nearest healing building when their health is below a certain value and to garrison soldiers in attacked buildings when such garrisoning can improve the building's fire power.

## DiplomacyManager
Deals with tributes with allies. It also updates the AI's [#VariabilityofAIstrategy cooperative trait] following its allies' actions. In "last man standing" games, if the AI happens to have no enemies at any point in the game, the AI will become enemies with the strongest player (but it will be more inclined to choose a neutral player, if there are any). It will wait to make this decision if it is not strong enough.

It will also handle diplomacy requests from other players. If a player switches their diplomacy stance with an AI in a positive direction (for example, "enemy" to "neutral"), it will respond with a chat message declining, accepting, or demanding a tribute in order to accept (or possible suggesting a different stance). On occasion, the AI will send diplomacy requests (via chat message) to other players (both to other AIs and human players). It will try to send requests to a player which shares many mutual enemies. If the other player does not respond by switching their diplomacy stance within some time, the AI will rescind the request.

## GameTypeManager
The gameTypeManager handles events that are important for specific victory conditions. In the Wonder victory condition, this consists of planning the construction of the wonder. In Regicide, it will handle cases when the hero is injured, and it will try to garrison the hero if it loses too much health. It will also train and manage a number of healer units and assign them as guards to the hero (the exact number is dependent on the AI's defensive trait). In Capture the Relic, it will also assign guards to captured relics, and it will try to move any captured relics to a nearby Civic Center. From time to time, it will send out armies to try to capture any gaia-owned relics on the map, and it will target the player that possesses the most relics.

## GarrisonManager
It keeps track of all units garrisoned except those garrisoned in ships for transport.

## NavalManager
The navalManager is in charge of maintaining the fleet (except trader ships which are dealt with in tradeManager) and managing the transport of units (done in transportPlan.js).

Presently, transport plans are limited to configurations such as land-water-land.

## ResearchManager
It looks for new tech available and decides on which one to research.

## TradeManager
The tradeManager deals with barter and trade. It is responsible for finding the best available trade route (either on land or water), training traders and switching trade route when a better one is available. 

# queueManager
The queueManager has several individual queues under its control, which each have a priority (dynamically adjustable). Plans (queueplanBuilding.js, queueplanResearch.js and queueplanTraining.js, all deriving from queueplan.js) are created when necessary by the different modules and are added to a suitable queue. The plans persist and are never destroyed until they are executed.

The queueManager controls resource allocation so it is proportional to priority. It attempts to do this fairly while not locking other queues, e.g. if building an outpost (stone + wood) and there is not enough stone, the queue manager may make a lower priority house with the surplus wood. Note that this only happens between queues, the next item in a queue will block everything following it. For this reason it is generally best to have lots of separate queues.

Note: This is the only code that ever trains or builds things. If the word is used within other modules then it means adding to the queue system in order to be trained or built.

# accessibility module

The accessibility module, included in the common API, provides two maps of connected tiles, the first one for land passability, the other one for water passability. In these maps, an index is attributed to each cell such that two cells connected by a land path have the same index in the land map, and two cells connected by a water path have the same index in the naval map.

These indexes are extensively used inside Petra. For example, when a unit is asked to gather on a field, it first looks for fields with the same index as its own, and if none is found but with different accessibility index, the unit will require a transport to the navalManager.

# Variability of AI strategy

In order to vary the strategy of the AI, several personality traits are used in the form of numbers between 0 and 1. Those already implemented include:
  * aggressive: the higher this number, the more rushes in early game
  * cooperative: the higher this number, the more helpful the AI will be when an allied is attacked. This number is dynamic, increasing (very slowly) when receiving a tribute from an ally or when being helped by an ally when under attack.
  * defensive: the higher this number, the more prone to build defensive structure.

Presently, these numbers are randomly chosen during the bot initialisation.

# Chat helper

All the messages send by the AI to the other players are centralized in the chatHelper file to ease maintenance, for example for changes needed for internationalization and new additions. For each situations in which the AI has to send a message, several ones are available and randomly chosen. 

# Help for debugging

Debug printouts can be set by modifying the value of this.debug in public/simulation/ai/petra/config.js. Different levels of printouts are possible:
* 0 = no printout, should be the default for releases.
* 1 = sanity checks intended to check the proper behaviour of the AI (for example when developping a new feature or mod).
* 2 = debug printouts for the main AI's decisions and detailed lists of resources and queues at regular time intervals.
* 3 = much detailed printouts.

### Batch simulating games
The behavior of the AI can be tested by running multiple games consecutively,
for example by analyzing the summary screen data at the end of the game from the replay menu.

As described in source:/ps/trunk/binaries/system/readme.txt, a new match can be started directly by passing the mapname and player assignments as command line arguments.

Add an `API3.exit()` statement to an arbitrary place of the AI code or
an `Engine.ExitProgram()` statement to the GUI code (for example if all players have been defeated or won in `messages.js`).

Using a unix shell or windows batch script allows to repeatedly start matches after the previous pyrogenesis instance exited.
