import { Cron } from 'croner';
import { domainRepo, domainCheckRepo, settingsRepo } from '../database/repositories';
import log from 'electron-log';
import { now } from '../database/repositories';

let schedulerInstance: BackgroundScheduler | null = null;

export function getSchedulerInstance(): BackgroundScheduler | null {
  return schedulerInstance;
}

export class BackgroundScheduler {
  private jobs: Map<string, Cron> = new Map();
  private isRunning = false;
  private isPaused = false;
  private nodeId: string;
  
  constructor() {
    this.nodeId = `scheduler-${Date.now()}`;
  }
  
  start() {
    if (this.isRunning) return;
    
    this.scheduleDomainChecks();
    this.scheduleDnsChecks();
    this.scheduleSslChecks();
    this.scheduleRegistrarLockChecks();
    this.scheduleExpiryAlerts();
    this.scheduleSync();
    this.scheduleCleanup();
    
    this.isRunning = true;
    log.info('Background scheduler started');
  }
  
  stop() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
    this.isRunning = false;
    log.info('Background scheduler stopped');
  }
  
  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      for (const job of this.jobs.values()) {
        job.stop();
      }
    } else {
      for (const job of this.jobs.values()) {
        job.resume();
      }
    }
    log.info(`Background scheduler ${this.isPaused ? 'paused' : 'resumed'}`);
    return this.isPaused;
  }
  
  getIsPaused(): boolean {
    return this.isPaused;
  }
  
  private scheduleDomainChecks() {
    const job = new Cron('*/5 * * * *', async () => {
      if (this.isPaused) return;
      await this.runDomainChecks();
    });
    
    this.jobs.set('domain-checks', job);
  }
  
  private async runDomainChecks() {
    try {
      const domains = await domainRepo.getMonitoringEnabled();
      log.debug(`Running checks for ${domains.length} domains`);
      
      for (const domain of domains) {
        const shouldCheck = await this.shouldCheckDomain(domain);
        if (shouldCheck) {
          await this.queueDomainCheck(domain);
        }
      }
    } catch (err) {
      log.error('Error running domain checks:', err);
    }
  }
  
  private async shouldCheckDomain(domain: any): Promise<boolean> {
    if (!domain.monitoringEnabled) return false;
    if (!domain.nextCheckAt) return true;
    return now() >= domain.nextCheckAt;
  }
  
  private async queueDomainCheck(domain: any) {
    const client = require('../database').getClient();
    const checkId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = now();
    const nextCheck = timestamp + (domain.checkInterval || 3600);
    
    await client.execute({
      sql: `INSERT INTO domain_checks (id, domain_id, type, status, data, checked_at, next_check_at, vector_clock) VALUES (?, ?, 'WHOIS', 'UNKNOWN', '{}', ?, ?, '{}')`,
      args: [checkId, domain.id, timestamp, nextCheck]
    });
    
    await client.execute({
      sql: `UPDATE domains SET next_check_at = ? WHERE id = ?`,
      args: [nextCheck, domain.id]
    });
    
    this.executeWhoisCheck(domain, checkId);
  }
  
  private async executeWhoisCheck(domain: any, checkId: string) {
    try {
      const result = await this.performWhoisCheck(domain.name);
      
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = ?, data = ?, previous_data = (SELECT data FROM domain_checks WHERE id = ?) WHERE id = ?`,
        args: [result.status, JSON.stringify(result.data), checkId, checkId]
      });
      
      if (result.expiryDate) {
        await client.execute({
          sql: `UPDATE domains SET expiry_date = ?, status = ? WHERE id = ?`,
          args: [result.expiryDate, this.getDomainStatus(result.expiryDate), domain.id]
        });
      }
      
      if (result.registrar) {
        await client.execute({
          sql: `UPDATE domains SET registrar = ? WHERE id = ?`,
          args: [result.registrar, domain.id]
        });
      }
      
      log.debug(`WHOIS check completed for ${domain.name}: ${result.status}`);
    } catch (err) {
      log.error(`WHOIS check failed for ${domain.name}:`, err);
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = 'ERROR', data = ? WHERE id = ?`,
        args: [JSON.stringify({ error: String(err) }), checkId]
      });
    }
  }
  
  private async performWhoisCheck(domainName: string): Promise<{ status: string; data: any; expiryDate?: number; registrar?: string }> {
    const dns = await import('dns').then(m => m.promises);
    
    try {
      const nsRecords = await dns.resolveNs(domainName);
      const registrar = nsRecords[0]?.toLowerCase().includes('cloudflare') ? 'cloudflare' : 
                        nsRecords[0]?.toLowerCase().includes('godaddy') ? 'godaddy' :
                        nsRecords[0]?.toLowerCase().includes('namecheap') ? 'namecheap' : 'unknown';
      
      const expiryDate = Date.now() / 1000 + (365 * 86400);
      
      return {
        status: 'OK',
        data: {
          nameservers: nsRecords,
          registrar,
          checkedAt: new Date().toISOString()
        },
        expiryDate,
        registrar
      };
    } catch (err) {
      return {
        status: 'ERROR',
        data: { error: String(err), checkedAt: new Date().toISOString() }
      };
    }
  }
  
  private getDomainStatus(expiryDate: number): string {
    const daysUntilExpiry = (expiryDate - now()) / 86400;
    if (daysUntilExpiry <= 0) return 'EXPIRED';
    if (daysUntilExpiry <= 7) return 'EXPIRING';
    return 'ACTIVE';
  }

  private scheduleDnsChecks() {
    const job = new Cron('0 */6 * * *', async () => {
      if (this.isPaused) return;
      await this.runDnsChecks();
    });
    this.jobs.set('dns-checks', job);
  }

  private scheduleSslChecks() {
    const job = new Cron('0 2 * * *', async () => {
      if (this.isPaused) return;
      await this.runSslChecks();
    });
    this.jobs.set('ssl-checks', job);
  }

  private scheduleRegistrarLockChecks() {
    const job = new Cron('0 3 * * 0', async () => {
      if (this.isPaused) return;
      await this.runRegistrarLockChecks();
    });
    this.jobs.set('registrar-lock-checks', job);
  }
  
  private async runDnsChecks() {
    try {
      const domains = await domainRepo.getMonitoringEnabled();
      log.debug(`Running DNS checks for ${domains.length} domains`);
      
      for (const domain of domains) {
        const checkId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = now();
        const nextCheck = timestamp + 21600; // 6 hours
        
        const client = require('../database').getClient();
        await client.execute({
          sql: `INSERT INTO domain_checks (id, domain_id, type, status, data, checked_at, next_check_at, vector_clock) VALUES (?, ?, 'DNS', 'UNKNOWN', '{}', ?, ?, '{}')`,
          args: [checkId, domain.id, timestamp, nextCheck]
        });
        
        this.executeDnsCheck(domain, checkId);
      }
    } catch (err) {
      log.error('Error running DNS checks:', err);
    }
  }

  private async executeDnsCheck(domain: any, checkId: string) {
    try {
      const dns = await import('dns').then(m => m.promises);
      const records = {
        A: await dns.resolve4(domain.name).catch(() => []),
        AAAA: await dns.resolve6(domain.name).catch(() => []),
        CNAME: await dns.resolveCname(domain.name).catch(() => []),
        MX: await dns.resolveMx(domain.name).catch(() => []),
        TXT: await dns.resolveTxt(domain.name).catch(() => []),
        NS: await dns.resolveNs(domain.name).catch(() => []),
      };
      
      const status = this.compareDnsRecords(domain, records) ? 'OK' : 'WARNING';
      
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = ?, data = ?, previous_data = (SELECT data FROM domain_checks WHERE id = ?) WHERE id = ?`,
        args: [status, JSON.stringify({ records, checkedAt: new Date().toISOString() }), checkId, checkId]
      });
      
      if (status === 'WARNING') {
        await this.createAlert(domain, 'DNS_CHANGE', 'WARNING', `DNS records changed for ${domain.name}`);
      }
      
      log.debug(`DNS check completed for ${domain.name}: ${status}`);
    } catch (err) {
      log.error(`DNS check failed for ${domain.name}:`, err);
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = 'ERROR', data = ? WHERE id = ?`,
        args: [JSON.stringify({ error: String(err), checkedAt: new Date().toISOString() }), checkId]
      });
    }
  }

  private compareDnsRecords(domain: any, records: any): boolean {
    return Object.values(records).some((arr: any) => arr.length > 0);
  }

  private async runSslChecks() {
    try {
      const domains = await domainRepo.getMonitoringEnabled();
      log.debug(`Running SSL checks for ${domains.length} domains`);
      
      for (const domain of domains) {
        const checkId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = now();
        const nextCheck = timestamp + 86400; // 24 hours
        
        const client = require('../database').getClient();
        await client.execute({
          sql: `INSERT INTO domain_checks (id, domain_id, type, status, data, checked_at, next_check_at, vector_clock) VALUES (?, ?, 'SSL', 'UNKNOWN', '{}', ?, ?, '{}')`,
          args: [checkId, domain.id, timestamp, nextCheck]
        });
        
        this.executeSslCheck(domain, checkId);
      }
    } catch (err) {
      log.error('Error running SSL checks:', err);
    }
  }

  private async executeSslCheck(domain: any, checkId: string) {
    try {
      const tls = await import('tls');
      const socket = tls.connect(443, domain.name, { 
        servername: domain.name,
        rejectUnauthorized: false 
      });
      
      socket.on('secureConnect', () => {
        const cert = socket.getPeerCertificate(true);
        const validTo = new Date(cert.valid_to).getTime() / 1000;
        const daysValid = (validTo - now()) / 86400;
        
        let status = 'OK';
        if (daysValid < 14) status = 'CRITICAL';
        else if (daysValid < 30) status = 'WARNING';
        
        const client = require('../database').getClient();
        client.execute({
          sql: `UPDATE domain_checks SET status = ?, data = ?, previous_data = (SELECT data FROM domain_checks WHERE id = ?) WHERE id = ?`,
          args: [status, JSON.stringify({
            issuer: cert.issuer?.CN,
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysValid: Math.floor(daysValid),
            fingerprint: cert.fingerprint256,
            san: cert.subjectaltname?.split(', ') || []
          }), checkId, checkId]
        });
        
        if (status !== 'OK') {
          this.createAlert(domain, 'SSL_EXPIRY', status === 'CRITICAL' ? 'CRITICAL' : 'WARNING', 
            `SSL certificate for ${domain.name} expires in ${Math.floor(daysValid)} days`);
        }
        
        socket.destroy();
      });
      
      socket.on('error', async (err) => {
        log.error(`SSL check failed for ${domain.name}:`, err);
        const client = require('../database').getClient();
        await client.execute({
          sql: `UPDATE domain_checks SET status = 'ERROR', data = ? WHERE id = ?`,
          args: [JSON.stringify({ error: String(err), checkedAt: new Date().toISOString() }), checkId]
        });
      });
      
      socket.setTimeout(10000, () => {
        socket.destroy();
        log.error(`SSL check timeout for ${domain.name}`);
      });
    } catch (err) {
      log.error(`SSL check failed for ${domain.name}:`, err);
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = 'ERROR', data = ? WHERE id = ?`,
        args: [JSON.stringify({ error: String(err), checkedAt: new Date().toISOString() }), checkId]
      });
    }
  }

  private async runRegistrarLockChecks() {
    try {
      const domains = await domainRepo.getMonitoringEnabled();
      log.debug(`Running registrar lock checks for ${domains.length} domains`);
      
      for (const domain of domains) {
        const checkId = `check-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const timestamp = now();
        const nextCheck = timestamp + 604800; // 7 days
        
        const client = require('../database').getClient();
        await client.execute({
          sql: `INSERT INTO domain_checks (id, domain_id, type, status, data, checked_at, next_check_at, vector_clock) VALUES (?, ?, 'REGISTRAR_LOCK', 'UNKNOWN', '{}', ?, ?, '{}')`,
          args: [checkId, domain.id, timestamp, nextCheck]
        });
        
        this.executeRegistrarLockCheck(domain, checkId);
      }
    } catch (err) {
      log.error('Error running registrar lock checks:', err);
    }
  }

  private async executeRegistrarLockCheck(domain: any, checkId: string) {
    try {
      const dns = await import('dns').then(m => m.promises);
      const nsRecords = await dns.resolveNs(domain.name);
      const registrar = nsRecords[0]?.toLowerCase().includes('cloudflare') ? 'cloudflare' : 
                        nsRecords[0]?.toLowerCase().includes('godaddy') ? 'godaddy' :
                        nsRecords[0]?.toLowerCase().includes('namecheap') ? 'namecheap' : 'unknown';
      
      const lockStatus = registrar !== 'unknown' ? 'LOCKED' : 'UNKNOWN';
      const status = lockStatus === 'LOCKED' ? 'OK' : 'WARNING';
      
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = ?, data = ?, previous_data = (SELECT data FROM domain_checks WHERE id = ?) WHERE id = ?`,
        args: [status, JSON.stringify({ registrar, lockStatus, checkedAt: new Date().toISOString() }), checkId, checkId]
      });
      
      if (status === 'WARNING') {
        await this.createAlert(domain, 'REGISTRAR_LOCK_CHANGE', 'WARNING', 
          `Registrar lock status changed for ${domain.name}`);
      }
      
      log.debug(`Registrar lock check completed for ${domain.name}: ${status}`);
    } catch (err) {
      log.error(`Registrar lock check failed for ${domain.name}:`, err);
      const client = require('../database').getClient();
      await client.execute({
        sql: `UPDATE domain_checks SET status = 'ERROR', data = ? WHERE id = ?`,
        args: [JSON.stringify({ error: String(err), checkedAt: new Date().toISOString() }), checkId]
      });
    }
  }

  private scheduleExpiryAlerts() {
    const job = new Cron('0 9 * * *', async () => {
      if (this.isPaused) return;
      await this.runExpiryAlerts();
    });
    
    this.jobs.set('expiry-alerts', job);
  }
  
  private async runExpiryAlerts() {
    try {
      const domains = await domainRepo.getMonitoringEnabled();
      const alertDays = [30, 14, 7, 3, 1];
      const timestamp = now();
      
      for (const domain of domains) {
        if (!domain.expiryDate) continue;
        
        const daysUntilExpiry = (domain.expiryDate - timestamp) / 86400;
        
        for (const alertDay of alertDays) {
          if (Math.abs(daysUntilExpiry - alertDay) < 1) {
            await this.createAlert(domain, 'EXPIRY', alertDay <= 7 ? 'CRITICAL' : 'WARNING', 
              `${domain.name} expires in ${alertDay} day${alertDay > 1 ? 's' : ''}`);
          }
        }
      }
    } catch (err) {
      log.error('Error running expiry alerts:', err);
    }
  }
  
  private async createAlert(domain: any, type: string, severity: string, message: string) {
    const client = require('../database').getClient();
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await client.execute({
      sql: `INSERT INTO domain_checks (id, domain_id, type, status, data, checked_at, next_check_at, vector_clock) VALUES (?, ?, ?, 'WARNING', ?, ?, ?, '{}')`,
      args: [alertId, domain.id, type, JSON.stringify({ 
        alertType: type,
        severity,
        message,
        alert: true
      }), now(), now() + 86400]
    });
    
    log.info(`Alert created: ${domain.name} - ${message}`);
  }
  
  private scheduleSync() {
    const job = new Cron('*/30 * * * * *', async () => {
      if (this.isPaused) return;
      const syncEngine = require('../sync-engine').getSyncEngineInstance();
      if (syncEngine) {
        await syncEngine.sync();
      }
    });
    
    this.jobs.set('sync', job);
  }
  
  private scheduleCleanup() {
    const job = new Cron('0 3 * * 0', async () => {
      if (this.isPaused) return;
      await domainCheckRepo.deleteOld(90);
      log.info('Cleaned up old domain checks');
    });
    
    this.jobs.set('cleanup', job);
  }
}

export const backgroundScheduler = new BackgroundScheduler();