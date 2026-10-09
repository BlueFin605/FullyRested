import { RestAction, ValidationType, ValidationTypeBody, RestTypeVerb, HttpProtocol, CreateEmptyAuthenticationDetails, CreateEmptyRestActionValidation } from '@fullyrested/core';
import { SystemSupportService } from '../system-support/system-support.service';

// Browser mode (ng serve, no Electron): the request every opened file resolves to
export function mockRequest(name: string): RestAction {
  return {
    id: `${name}-mockrequest`,
    name: 'name',
    body: {
      contentType: 'application/json',
      body: `{"products":[{"name":"car","product":[{"name":"honda","model":[{"id":"civic","name":"civic"},{"id":"accord","name":"accord"},{"id":"crv","name":"crv"},{"id":"pilot","name":"pilot"},{"id":"odyssey","name":"odyssey"}]}]}]}`
    },
    verb: RestTypeVerb.get,
    protocol: HttpProtocol.https,
    url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
    headers: [
      {
        key: "accept",
        value: "*/*",
        active: true,
        id: 'aaaaa'
      },
      {
        key: "content-type",
        value: "application/x-www-form-urlencoded",
        active: true,
        id: 'bbbbb'
      },
      {
        key: "user-agent",
        value: "RestEasy1.0",
        active: true,
        "id": 'ccccc'
      },
      {
        key: "accept-encoding",
        value: "gzip, deflate, br",
        active: true,
        "id": 'ddddd'
      },
      {
        key: "environment",
        value: "{{env}}",
        active: true,
        "id": 'eeeee'
      }
    ],
    parameters: [],
    authentication: CreateEmptyAuthenticationDetails('inherit'),
    validation: {
      type: ValidationType.HeadersBody,
      body: ValidationTypeBody.JsonSchema,
      headers: [],
      httpCode: 200,
      jsonSchema: {
        schema: `{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"userId":{"type":"integer"},"id":{"type":"integer"},"title":{"type":"string"},"completed":{"type":"boolean"},"information":{"type":"object","properties":{"summary":{"type":"string"},"details":{"type":"string"},"contributers":{"type":"object","properties":{"author":{"type":"string"},"editor":{"type":"string"},"factchecker":{"type":"string"}},"required":["author","editor","factchecker"]}},"required":["summary","details","contributers"]}},"required":["userId","id","title","completed","information"]}`
      }
    },
    runs: [
      { id: `${name}-mockrun1`, name: 'test1', parameters: [], headers: [], variables: [{ variable: 'env', value: 'runone', active: true, id: new SystemSupportService().generateGUID() }], secrets: [], authentication: CreateEmptyAuthenticationDetails('none'), validation: CreateEmptyRestActionValidation(ValidationType.Inherit) },
      { id: `${name}-mockrun2`, name: 'test2', parameters: [], headers: [], variables: [{ variable: 'env', value: 'runtwo', active: true, id: new SystemSupportService().generateGUID() }], secrets: [], authentication: CreateEmptyAuthenticationDetails('none'), validation: CreateEmptyRestActionValidation(ValidationType.Inherit) },
      { id: `${name}-mockrun3`, name: 'test3', parameters: [], headers: [], variables: [{ variable: 'env', value: 'unkrunthreenown', active: true, id: new SystemSupportService().generateGUID() }], secrets: [], authentication: CreateEmptyAuthenticationDetails('none'), validation: CreateEmptyRestActionValidation(ValidationType.Inherit) }
    ]
  };
}
