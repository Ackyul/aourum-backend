const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;
let redisConnection = null;
let emailQueue = null;
let emailWorker = null;

if (REDIS_URL) {
  try {
    redisConnection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null // Requerido por BullMQ
    });
    
    emailQueue = new Queue('emails', { connection: redisConnection });
    
    // Workers solo se inician si hay una conexión Redis válida
    emailWorker = new Worker('emails', async (job) => {
      console.log(`[Worker] Procesando envío de correo de recuperación para: ${job.data.to}`);
      const { Resend } = require('resend');
      const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
      if (resend) {
        await resend.emails.send({
          from: job.data.from || 'AOURUM <onboarding@resend.dev>',
          to: job.data.to,
          subject: job.data.subject,
          html: job.data.html
        });
        console.log(`[Worker] Correo enviado exitosamente a: ${job.data.to}`);
      } else {
        console.warn(`[Worker] Resend no configurado. El enlace generado es: ${job.data.resetLink}`);
      }
    }, { connection: redisConnection });

    emailWorker.on('failed', (job, err) => {
      console.error(`[Worker] Falló el trabajo de correo para ${job?.data?.to}:`, err.message);
    });

    console.log('✅ Colas BullMQ y Workers inicializados con éxito.');
  } catch (err) {
    console.warn('⚠️ No se pudo inicializar BullMQ. Usando modo asíncrono/in-memory.', err.message);
  }
}

// Envío de correos asíncronos en segundo plano
async function queueEmail(jobData) {
  if (emailQueue) {
    await emailQueue.add('send-email', jobData);
    console.log(`[Queue] Correo de recuperación encolado para: ${jobData.to}`);
  } else {
    // Modo de fallback asíncrono en memoria
    console.log(`[Queue Fallback] Procesando envío de correo de forma directa en segundo plano local...`);
    setImmediate(async () => {
      try {
        const { Resend } = require('resend');
        const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
        if (resend) {
          await resend.emails.send({
            from: jobData.from || 'AOURUM <onboarding@resend.dev>',
            to: jobData.to,
            subject: jobData.subject,
            html: jobData.html
          });
          console.log(`[Queue Fallback] Correo enviado directamente a: ${jobData.to}`);
        } else {
          console.warn(`[Queue Fallback] Resend no configurado. El enlace generado es: ${jobData.resetLink}`);
        }
      } catch (err) {
        console.error('Error en envío directo de correo:', err);
      }
    });
  }
}

module.exports = {
  queueEmail,
  redisConnection
};
