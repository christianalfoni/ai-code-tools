import { describe, it, expect } from 'vitest';
import { executeTools } from './execute_tools';

describe('executeTools with AST validation', () => {
  const mockTools = {
    greet: {
      execute: async (name: string) => `Hello, ${name}!`
    },
    readFile: {
      execute: async (path: string) => `Contents of ${path}`
    }
  };

  describe('safe code execution', () => {
    it('should execute safe code that uses tools', async () => {
      const code = `
        const result = await tools.greet('World');
        return result;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toBe('Hello, World!');
    });

    it('should allow standard JavaScript operations', async () => {
      const code = `
        const numbers = [1, 2, 3, 4, 5];
        const sum = numbers.reduce((a, b) => a + b, 0);
        const result = await tools.greet(\`Sum is \${sum}\`);
        return result;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toBe('Hello, Sum is 15!');
    });
  });

  describe('require() and import attacks', () => {
    it('should block require() calls', async () => {
      const code = `
        const fs = require('fs');
        return fs.readFileSync('/etc/passwd', 'utf8');
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: require');
    });

    it('should block dynamic require', async () => {
      const code = `
        const mod = 'fs';
        const fs = require(mod);
        return fs.readdirSync('.');
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: require');
    });

    it('should block import statements', async () => {
      const code = `
        import fs from 'fs';
        return fs.readFileSync('/etc/passwd', 'utf8');
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      // Acorn fails to parse import in a non-module context
      expect(result.output).toMatch(/import.*export/i);
    });
  });

  describe('eval() and Function constructor attacks', () => {
    it('should block eval() calls', async () => {
      const code = `
        const malicious = "require('fs').readFileSync('/etc/passwd')";
        return eval(malicious);
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: eval');
    });

    it('should block Function constructor', async () => {
      const code = `
        const fn = new Function('return require("fs")');
        return fn();
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: Function');
    });

    it('should block Function constructor with string execution', async () => {
      const code = `
        const exploit = Function('return this.process.env')();
        return exploit;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: Function');
    });
  });

  describe('process and global object attacks', () => {
    it('should block access to process object', async () => {
      const code = `
        return process.env;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: process');
    });

    it('should block access to process.exit', async () => {
      const code = `
        process.exit(1);
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: process');
    });

    it('should block access to global object', async () => {
      const code = `
        return global.process.env;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: global');
    });

    it('should block access to globalThis', async () => {
      const code = `
        return globalThis.process;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: globalThis');
    });

    it('should block access to module and exports', async () => {
      const code = `
        module.exports = { hacked: true };
        return module;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: module');
    });
  });

  describe('timer-based attacks', () => {
    it('should block setTimeout', async () => {
      const code = `
        setTimeout(() => {
          require('child_process').exec('rm -rf /');
        }, 1000);
        return 'scheduled';
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: setTimeout');
    });

    it('should block setInterval', async () => {
      const code = `
        setInterval(() => console.log('spam'), 100);
        return 'running';
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: setInterval');
    });

    it('should block setImmediate', async () => {
      const code = `
        setImmediate(() => require('fs').unlinkSync('important.txt'));
        return 'queued';
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: setImmediate');
    });
  });

  describe('sneaky attempts to bypass validation', () => {
    it('should block indirect access via this keyword tricks', async () => {
      const code = `
        const getGlobal = function() { return this; }.call(global);
        return getGlobal.process.env;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: global');
    });

    it('should block attempts to access __dirname and __filename', async () => {
      const code = `
        return __dirname + '/' + __filename;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('Forbidden identifier: __dirname');
    });

    it('should block constructor property access attempts', async () => {
      const code = `
        const F = {}.constructor.constructor;
        return F('return process.env')();
      `;

      const result = await executeTools(code, mockTools);

      // This should be caught either by the Function identifier or fail at runtime
      // The validation catches Function but constructor property might slip through
      // However, the actual 'process' identifier would still be blocked in the string
      expect(result.output).toContain('Code validation failed');
    });
  });
});
