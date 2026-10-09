import { Collection, CurrentState, RestTypeVerb, HttpProtocol, CreateEmptyAuthenticationDetails, CreateEmptyRestActionValidation } from '@fullyrested/core';
import { SystemSupportService } from '../system-support/system-support.service';

// Browser mode: the saved open-tabs state the app starts with
export const mockCurrentState: CurrentState = {
  sessions: [
    {
      collectionGuid: "nocollection",
      actions: [
        {
          action: {
            id: "3af54a2-ee78-1236-958d-83e496a94ba3",
            name: "Image (trade-me)",
            body: { contentType: 'application/json', body: '{\"products\":[{\"name\":\"car\",\"product\":[{\"name\":\"honda\",\"model\":[{\"id\":\"civic\",\"name\":\"civic\"},{\"id\":\"accord\",\"name\":\"accord\"},{\"id\":\"crv\",\"name\":\"crv\"},{\"id\":\"pilot\",\"name\":\"pilot\"},{\"id\":\"odyssey\",\"name\":\"odyssey\"}]}]}]}' },
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.0",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "3af54a2-ee12-1236-95aa-83e496a94ba4",
            name: "XML Result",
            body: { contentType: 'none', body: undefined },
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "cdn.animenewsnetwork.com/encyclopedia/api.xml?title=4658",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "my-header1",
                value: "{{header1}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "my-header2",
                value: "{{header2}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: false,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "param1",
                value: "{{value1}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "param2",
                value: "{{value2}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },

            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "ddd54a4-ee95-4321-95aa-83e496a94ba4",
            name: "JSON Result",
            body: { contentType: 'none', body: undefined },
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "jsonplaceholder.typicode.com/todos/1",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.2",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sort",
                value: "firstname",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "ddd54a4-ee95-7654-95fd-73e496a94ba4",
            name: "logo",
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
            headers: [],
            parameters: [],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: [],
            body: { contentType: 'none', body: undefined }
          },
          dirty: false,
          activeTab: false,
          fullFilename: "/Users/deanmitchell/Projects/FullyRested/Test Collection/trademe/logo.reasyreq"
        },
        {
          action: {
            id: "ccc54c4-ee95-7654-95fd-86e496a94ba5",
            name: "google search",
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "www.google.com/search",
            headers: [],
            parameters: [
              {
                key: "q",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sca_esv",
                value: "578070544",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "rlz",
                value: "1C5CHFA_enNZ1009NZ1009",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sxsrf",
                value: "AM9HkKllLm75pun144GmcZse4QxpFrlWNg:1698741847525",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ei",
                value: "V75AZa3bH_7n2roP186e8Aw",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ved",
                value: "0ahUKEwjt4ovD8p-CAxX-s1YBHVenB84Q4dUDCBE",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "uact",
                value: "5",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "oq",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "gs_lp",
                value: "Egxnd3Mtd2l6LXNlcnAiMGFuZ3VsYXIgbWF0ZXJpYWwgc2VsZWN0IGZpcnN0IHRhYiAuc2VsZWN0ZWRJbmRleDIHECEYoAEYCkilD1C5BVjhCHABeAGQAQCYAb8CoAHSBKoBBTItMS4xuAEDyAEA-AEB-AECwgIKEAAYRxjWBBiwA8ICBRAhGKABwgIIECEYFhgeGB3iAwQYACBBiAYBkAYI",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sclient",
                value: "gws-wiz-serp",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "d87019dc-0eea-45a2-a1fa-1e4b57a6b76e",
            name: "MDListModule Search",
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "www.google.com/search",
            headers: [],
            parameters: [
              {
                key: "q",
                value: "MdListModule",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "rlz",
                value: "1C5CHFA_enNZ1009NZ1009",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "oq",
                value: "MdListModule",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "gs_lcrp",
                value: "EgZjaHJvbWUyBggAEEUYOTIJCAEQABgNGIAEMgkIAhAAGA0YgAQyCQgDEAAYDRiABDIJCAQQABgNGIAEMggIBRAAGA0YHtIBBzQxOWowajeoAgCwAgA",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sourceid",
                value: "chrome",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ie",
                value: "UTF-8",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        }
      ]
    },
    {
      collectionGuid: "92f54a1-be78-4605-968d-13e456a94aab",
      actions: [
        {
          action: {
            id: "92f54a1-be78-4606-958d-13e456a94aac",
            name: "XML Result",
            body: { contentType: 'none', body: undefined },
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "cdn.animenewsnetwork.com/encyclopedia/api.xml",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: false,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "title",
                value: "4658",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: false,
          activeTab: false,
          fullFilename: "/Users/deanmitchell/Projects/FullyRested/Test Collection/xml/XML Result.reasyreq"
        },
        {
          action: {
            id: "32f54a1-be78-4606-958d-23e496a94aaf",
            name: "JSON Result(sfasfasfsadddd)",
            body: { contentType: 'none', body: undefined },
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "jsonplaceholder.typicode.com/todos/1",
            headers: [
              {
                key: "accept",
                value: "*/*",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "content-type",
                value: "application/x-www-form-urlencoded",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "user-agent",
                value: "RestEasy1.2",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "accept-encoding",
                value: "gzip, deflate, br",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            parameters: [
              {
                key: "userid",
                value: "1",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sort",
                value: "firstname",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "32b54a4-be78-5603-958d-23e496a94baf",
            name: "was this innamed",
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "www.trademe.co.nz/images/frend/trademe-logo-no-tagline.png",
            headers: [],
            parameters: [],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "32b54a4-be78-1206-958d-83e496a94bab",
            name: "google search",
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "{{host}}/search",
            headers: [
              {
                key: "my-header1",
                value: "{{header1}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "my-header2",
                value: "{{header2}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "Environment",
                value: "{{env}}",
                active: true,
                id: new SystemSupportService().generateGUID()
              }],
            parameters: [
              {
                key: "q",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sca_esv",
                value: "578070544",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "rlz",
                value: "1C5CHFA_enNZ1009NZ1009",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sxsrf",
                value: "AM9HkKllLm75pun144GmcZse4QxpFrlWNg:1698741847525",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ei",
                value: "V75AZa3bH_7n2roP186e8Aw",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "ved",
                value: "0ahUKEwjt4ovD8p-CAxX-s1YBHVenB84Q4dUDCBE",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "uact",
                value: "5",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "oq",
                value: "angular material select first tab .selectedIndex",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "gs_lp",
                value: "Egxnd3Mtd2l6LXNlcnAiMGFuZ3VsYXIgbWF0ZXJpYWwgc2VsZWN0IGZpcnN0IHRhYiAuc2VsZWN0ZWRJbmRleDIHECEYoAEYCkilD1C5BVjhCHABeAGQAQCYAb8CoAHSBKoBBTItMS4xuAEDyAEA-AEB-AECwgIKEAAYRxjWBBiwA8ICBRAhGKABwgIIECEYFhgeGB3iAwQYACBBiAYBkAYI",
                active: true,
                id: new SystemSupportService().generateGUID()
              },
              {
                key: "sclient",
                value: "gws-wiz-serp",
                active: true,
                id: new SystemSupportService().generateGUID()
              }
            ],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('iherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        },
        {
          action: {
            id: "c78091f7-cdb4-465c-a8c9-02742470b92b",
            name: "stackoverflow search",
            verb: RestTypeVerb.get,
            protocol: HttpProtocol.https,
            url: "stackoverflow.com/questions/32979630/how-can-i-display-a-save-as-dialog-in-an-electron-app",
            headers: [],
            parameters: [],
            body: { contentType: 'none', body: undefined },
            authentication: CreateEmptyAuthenticationDetails('inherit'),
            validation: CreateEmptyRestActionValidation(undefined),
            runs: []
          },
          dirty: true,
          activeTab: false,
          fullFilename: ""
        }
      ]
    }
  ],
  recentCollections: [
    {
      fullFileName: "/Users/deanmitchell/Projects/FullyRested/Test Collection/my collection.reasycol",
      name: "my collection.reasycol",
      path: "/Users/deanmitchell/Projects/FullyRested/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/FullyRested/Test Collection/my 2nd collection.reasycol",
      name: "my 2nd collection.reasycol",
      path: "/Users/deanmitchell/Projects/FullyRested/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/FullyRested/Test Collection/my 3rd collection.reasycol",
      name: "my 3rd collection.reasycol",
      path: "/Users/deanmitchell/Projects/FullyRested/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/FullyRested/Test Collection/my 4th collection.reasycol",
      name: "my 4th collection.reasycol",
      path: "/Users/deanmitchell/Projects/FullyRested/Test Collection"
    },
    {
      fullFileName: "/Users/deanmitchell/Projects/FullyRested/Test Collection/my 5th collection.reasycol",
      name: "my 5th collection.reasycol",
      path: "/Users/deanmitchell/Projects/FullyRested/Test Collection"
    }
  ],
  currentCollection: "/Users/deanmitchell/Projects/FullyRested/Test Collection/my collection.reasycol"
};
