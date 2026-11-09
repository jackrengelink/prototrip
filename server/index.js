import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { createCache } from './lib/cache.js';
import { createFlightService } from './providers/flights/index.js';
import { createPlacesService } from './providers/places/index.js';
import { createWeatherService } from './providers/weather.js';
import { createApp } from './app.js';
import { createDirectory } from './data/directory.js';
import { createGroundService } from './providers/ground/index.js';

const config = loadConfig();
const cache = createCache();
const logger = console;
const directory = createDirectory({ root: config.root, logger });
directory.ready().then((n) => logger.info(`Airport directory: ${n} airports and cities`));

const app = createApp({
  config,
  flights: createFlightService({ config, cache, directory, logger }),
  ground: createGroundService({ cache, logger }),
  places: createPlacesService({ config, cache, logger }),
  weather: createWeatherService({ cache, logger }),
  logger,
});

process.on('unhandledRejection', (err) => logger.error('[process] unhandled rejection:', err));

const HOST = config.host;
const MAX_PORT_TRIES = 10;
const server = createServer(app);

function listen(port, triesLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      // Usually an older ProtoTrip still running in another window: use the next port instead of crashing.
      logger.warn(`Port ${port} is busy (is ProtoTrip already running in another window?). Trying ${port + 1}…`);
      listen(port + 1, triesLeft - 1);
      return;
    }
    logger.error(`Could not start ProtoTrip: ${err.message}`);
    process.exit(1);
  });
  server.listen(process.env.PORT, '0.0.0.0');
}

server.once('listening', () => {
  server.removeAllListeners('error');
  const live = [config.ryanair && 'Ryanair (no key)', config.travelpayoutsToken && 'Travelpayouts', config.serpapiKey && 'SerpApi'].filter(Boolean);
  logger.info(`ProtoTrip running at http://localhost:${server.address().port}`);
  logger.info(live.length ? `Live flight sources: ${live.join(', ')}` : 'No flight sources enabled, so fares are simulated (demo mode). See API-KEYS.md');
});

listen(config.port, MAX_PORT_TRIES);
