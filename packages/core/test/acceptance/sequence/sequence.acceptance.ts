// Copyright IBM Corp. 2013,2017. All Rights Reserved.
// Node module: loopback
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

import {
  Application,
  Server,
  api,
  OpenApiSpec,
  ParameterObject,
  ServerRequest,
  ServerResponse,
  parseOperationArgs,
  ParsedRequest,
  OperationArgs,
  FindRoute,
  InvokeMethod,
  Send,
  Reject,
  SequenceHandler,
} from '../../..';
import {expect, Client, createClientForServer} from '@loopback/testlab';
import {anOpenApiSpec} from '@loopback/openapi-spec-builder';
import {inject, Constructor, Context} from '@loopback/context';

/* # Feature: Sequence
 * - In order to build REST APIs
 * - As a framework developer
 * - I want the framework to handle default sequence and user defined sequence
 */
describe('Sequence', () => {
  let app: Application;
  beforeEach(givenAppWithController);

  it('provides a default sequence', async () => {
    const client = await whenIMakeRequestTo(app);
    await client.get('/name').expect('SequenceApp');
  });

  it('allows users to define a custom sequence as a function', async () => {
    app.handler((sequence, request, response) => {
      sequence.send(response, 'hello world');
    });
    const client = await whenIMakeRequestTo(app);
    await client.get('/').expect('hello world');
  });

  it('allows users to define a custom sequence as a class', async () => {
    class MySequence implements SequenceHandler {
      constructor(@inject('sequence.actions.send') private send: Send) {}

      async handle(req: ParsedRequest, res: ServerResponse) {
        this.send(res, 'hello world');
      }
    }
    // bind user defined sequence
    app.sequence(MySequence);

    const client = await whenIMakeRequestTo(app);
    await client.get('/').expect('hello world');
  });

  it('allows users to bind a custom sequence class', async () => {
    class MySequence {
      constructor(
        @inject('findRoute') protected findRoute: FindRoute,
        @inject('invokeMethod') protected invoke: InvokeMethod,
        @inject('sequence.actions.send') protected send: Send,
      ) {}

      async handle(req: ParsedRequest, res: ServerResponse) {
        const {route, pathParams} = this.findRoute(req);
        const args = await parseOperationArgs(req, route, pathParams);
        const result = await this.invoke(route, args);
        this.send(res, `MySequence ${result}`);
      }
    }

    app.sequence(MySequence);

    const client = await whenIMakeRequestTo(app);
    await client.get('/name').expect('MySequence SequenceApp');
  });

  it('user-defined Send', async () => {
    const send: Send = (response, result) => {
      response.setHeader('content-type', 'text/plain');
      response.end(`CUSTOM FORMAT: ${result}`);
    };
    app.bind('sequence.actions.send').to(send);

    const client = await whenIMakeRequestTo(app);
    await client.get('/name').expect('CUSTOM FORMAT: SequenceApp');
  });

  it('user-defined Reject', async () => {
    const reject: Reject = (response, request, error) => {
      response.statusCode = 418; // I'm a teapot
      response.end();
    };
    app.bind('sequence.actions.reject').to(reject);

    const client = await whenIMakeRequestTo(app);
    await client.get('/unknown-url').expect(418);
  });

  function givenAppWithController() {
    givenAnApplication();
    app.bind('application.name').to('SequenceApp');

    const apispec = anOpenApiSpec()
      .withOperation('get', '/name', {
        'x-operation-name': 'getName',
        responses: {
          '200': {
            type: 'string',
          },
        },
      })
      .build();

    @api(apispec)
    class InfoController {
      constructor(@inject('application.name') public appName: string) {}

      async getName(): Promise<string> {
        return this.appName;
      }
    }
    givenControllerInApp(InfoController);
  }
  /* ===== HELPERS ===== */

  function givenAnApplication() {
    app = new Application();
  }

  function givenControllerInApp<T>(controller: Constructor<T>) {
    app.controller(controller);
  }

  function whenIMakeRequestTo(application: Application): Promise<Client> {
    const server = new Server(application, {port: 0});
    return createClientForServer(server);
  }
});
