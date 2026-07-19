const Redis = require('ioredis');
let redisClient = null;

const REDIS_URL = process.env.REDIS_URL;
if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 3000
    });
    redisClient.on('error', (err) => {
      console.warn('⚠️ Error de conexión en Redis, usando caché en memoria local:', err.message);
    });
    console.log('✅ Conexión con Redis inicializada.');
  } catch (err) {
    console.warn('⚠️ No se pudo inicializar el cliente Redis, usando caché en memoria local:', err.message);
  }
} else {
  console.log('ℹ️ REDIS_URL no está configurada. Usando caché en memoria local.');
}

const localCache = {};

async function get(key) {
  if (redisClient && redisClient.status === 'ready') {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.error('Error al leer de Redis:', err);
    }
  }
  
  const entry = localCache[key];
  if (entry && entry.expiry > Date.now()) {
    return entry.value;
  }
  return null;
}

async function set(key, value, durationSeconds = 15) {
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', durationSeconds);
      return;
    } catch (err) {
      console.error('Error al escribir en Redis:', err);
    }
  }
  
  localCache[key] = {
    value,
    expiry: Date.now() + (durationSeconds * 1000)
  };
}

async function del(key) {
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      console.error('Error al borrar de Redis:', err);
    }
  }
  delete localCache[key];
}

async function flush() {
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.flushall();
      return;
    } catch (err) {
      console.error('Error al vaciar Redis:', err);
    }
  }
  for (const key in localCache) {
    delete localCache[key];
  }
}

async function clearPattern(pattern) {
  if (redisClient && redisClient.status === 'ready') {
    try {
      const keys = await redisClient.keys(`*${pattern}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
        console.log(`[Redis Caché INVALIDADA] Eliminada(s) clave(s) que contienen: ${pattern}`);
      }
      return;
    } catch (err) {
      console.error('Error al invalidar patrón en Redis:', err);
    }
  }
  
  const keys = Object.keys(localCache);
  keys.forEach(key => {
    if (key.includes(pattern)) {
      console.log(`[Memoria Caché INVALIDADA] Eliminada clave: ${key}`);
      delete localCache[key];
    }
  });
}

module.exports = {
  get,
  set,
  del,
  flush,
  clearPattern
};
