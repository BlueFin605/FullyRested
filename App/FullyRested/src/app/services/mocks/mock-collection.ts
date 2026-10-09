import { CreateEmptyAuthenticationDetails } from '@fullyrested/core';
import { SystemSupportService } from '../system-support/system-support.service';

// Browser mode: the collection File > Open Collection loads
export const mockCollection = {
  config: {
    collectionGuid: '92f54a1-be78-4605-968d-13e456a94aab',
    collectionEnvironment: {
      name: '',
      id: 'aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      variables: [
        { variable: 'env', value: 'unknown', active: true, id: new SystemSupportService().generateGUID() },
        { variable: 'host', value: 'www.google.com', active: true, id: new SystemSupportService().generateGUID() }
      ],
      secrets: [
        { $secret: 'accesskey', $value: 'abcdefghijklm', active: true, id: new SystemSupportService().generateGUID() },
      ],
      auth: {
        authentication: 'awssig',
        awsSig: { signUrl: false, accessKey: 'akey', secretKey: 'skey', awsRegion: 'eu-central-1', serviceName: 'sName' },
        basicAuth: { userName: '', password: '' },
        bearerToken: { token: '' }
      }
    },
    environments: [
      {
        name: 'prod',
        id: new SystemSupportService().generateGUID(),
        variables: [
          { variable: 'env', value: 'prod', active: true, id: new SystemSupportService().generateGUID() }
        ],
        secrets: [
          { $secret: 'accesskey', $value: 'kjhfkjshdfkhksahfdkjasd', active: true, id: new SystemSupportService().generateGUID() },
        ],
        auth: CreateEmptyAuthenticationDetails('inherit')
      },
      {
        name: 'test',
        id: new SystemSupportService().generateGUID(),
        variables: [],
        secrets: [],
        auth: CreateEmptyAuthenticationDetails('inherit')
      },
      {
        name: 'dev',
        id: new SystemSupportService().generateGUID(),
        variables: [],
        secrets: [],
        auth: CreateEmptyAuthenticationDetails('inherit')
      }
    ],
    selectedEnvironmentId: '3df64a2-af78-6321-958e-92e496a94fa3'
  },
  filename: '<filename>',
  path: '<path>',
  name: 'collection name'
};
