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

  describe('toString() attacks to expose implementation', () => {
    it('should not expose tool implementation via toString()', async () => {
      // Create a tool with sensitive information in its implementation
      const sensitiveTools = {
        apiCall: {
          execute: async (endpoint: string) => {
            const API_KEY = 'secret-key-12345';
            const INTERNAL_URL = 'https://internal.api.company.com';
            // Simulate API call with sensitive data
            return `Called ${INTERNAL_URL}${endpoint} with key ${API_KEY}`;
          }
        }
      };

      const code = `
        // Try to extract the implementation
        const impl = tools.apiCall.toString();
        return impl;
      `;

      const result = await executeTools(code, sensitiveTools);

      // Should NOT contain the sensitive information
      expect(result.output).not.toContain('secret-key-12345');
      expect(result.output).not.toContain('internal.api.company.com');
      expect(result.output).not.toContain('API_KEY');

      // Should only show the wrapper function
      expect(result.output).toContain('async');
      expect(result.output).toContain('...');
    });

    it('should not expose implementation via tools.name.execute.toString()', async () => {
      const sensitiveTools = {
        deleteUser: {
          execute: async (userId: string) => {
            const ADMIN_TOKEN = 'admin-secret-token';
            // Sensitive deletion logic
            return `Deleted user ${userId} using ${ADMIN_TOKEN}`;
          }
        }
      };

      const code = `
        const impl = tools.deleteUser.execute.toString();
        return impl;
      `;

      const result = await executeTools(code, sensitiveTools);

      expect(result.output).not.toContain('admin-secret-token');
      expect(result.output).not.toContain('ADMIN_TOKEN');
    });

    it('should still allow normal toString() on other objects', async () => {
      const code = `
        const obj = { name: 'test', value: 42 };
        return obj.toString();
      `;

      const result = await executeTools(code, mockTools);

      // Normal toString should work fine
      expect(result.output).toBe('[object Object]');
    });
  });

  describe('infinite loop prevention', () => {
    it('should block while loops', async () => {
      const code = `
        let counter = 0;
        while(true) {
          counter++;
        }
        return counter;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('while loops are not allowed');
    });

    it('should block do-while loops', async () => {
      const code = `
        let i = 0;
        do {
          i++;
        } while(i < 10);
        return i;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toContain('Code validation failed');
      expect(result.output).toContain('do-while loops are not allowed');
    });

    it('should allow for loops', async () => {
      const code = `
        let sum = 0;
        for(let i = 0; i < 5; i++) {
          sum += i;
        }
        return sum;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toBe('10');
    });

    it('should allow array iteration methods', async () => {
      const code = `
        const numbers = [1, 2, 3, 4, 5];
        const doubled = numbers.map(n => n * 2);
        return doubled;
      `;

      const result = await executeTools(code, mockTools);

      // JSON.stringify formats with line breaks, so just check the values are there
      expect(result.output).toContain('2');
      expect(result.output).toContain('10');
    });

    it('should allow for-of loops', async () => {
      const code = `
        const items = ['a', 'b', 'c'];
        let result = '';
        for(const item of items) {
          result += item;
        }
        return result;
      `;

      const result = await executeTools(code, mockTools);

      expect(result.output).toBe('abc');
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
