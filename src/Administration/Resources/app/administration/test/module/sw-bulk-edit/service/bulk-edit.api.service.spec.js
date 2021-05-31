import createLoginService from 'src/core/service/login.service';
import createHTTPClient from 'src/core/factory/http.factory';
import BulkEditApiService from 'src/module/sw-bulk-edit/service/bulk-edit.api.service';

function getBulkEditApiService(client = null) {
    if (client === null) {
        client = createHTTPClient();
    }

    const loginService = createLoginService(client, Shopware.Context.api);
    const bulkEditApiService = new BulkEditApiService(client, loginService);

    bulkEditApiService.syncService = {
        sync: () => {
        }
    };

    return bulkEditApiService;
}

describe('module/sw-bulk-edit/service/bulk-edit.api.service', () => {
    it('is registered correctly', () => {
        expect(getBulkEditApiService()).toBeInstanceOf(BulkEditApiService);
    });

    it('should find correct product handler', () => {
        const bulkEditSyncApiService = getBulkEditApiService();

        const handler = bulkEditSyncApiService._findBulkEditHandler('product');

        expect(typeof handler).toBe('function');
        expect(handler.name).toBe('_bulkEditProductHandler');
    });

    it('should throw error when no handler found', async () => {
        const bulkEditSyncApiService = getBulkEditApiService();

        expect(() => bulkEditSyncApiService._findBulkEditHandler('custom-module')).toThrow(Error('Bulk Edit Handler not found for custom-module module'));
    });

    it('should call correct handler when using bulkEdit', async () => {
        const bulkEditSyncApiService = getBulkEditApiService();

        const bulkEditProductHandler = jest.spyOn(bulkEditSyncApiService, '_bulkEditProductHandler').mockImplementation(() => Promise.resolve(true));

        bulkEditSyncApiService.handlers = {
            product: bulkEditProductHandler
        };

        const result = await bulkEditSyncApiService.bulkEdit('product', ['abc', 'xyz'], []);

        expect(bulkEditProductHandler).toHaveBeenCalledTimes(1);
        expect(bulkEditProductHandler).toHaveBeenCalledWith([]);
        expect(bulkEditSyncApiService.entityName).toEqual('product');
        expect(bulkEditSyncApiService.entityIds).toEqual(['abc', 'xyz']);
        expect(result).toEqual(true);
    });

    it('should call syncService sync when using bulkEditProductHandler', async () => {
        const bulkEditSyncApiService = getBulkEditApiService();
        const payload = { product: { operation: 'upsert', entity: 'product', payload: [] } };


        const buildBulkSyncPayloadMethod = jest.spyOn(bulkEditSyncApiService, 'buildBulkSyncPayload').mockImplementation(() => Promise.resolve(payload));
        const syncMethod = jest.spyOn(bulkEditSyncApiService.syncService, 'sync').mockImplementation(() => Promise.resolve(true));

        const changes = [{ type: 'overwrite', field: 'description', value: 'test' }];

        const result = await bulkEditSyncApiService._bulkEditProductHandler(changes);

        expect(buildBulkSyncPayloadMethod).toHaveBeenCalledTimes(1);
        expect(buildBulkSyncPayloadMethod).toHaveBeenCalledWith(changes);

        expect(syncMethod).toHaveBeenCalledTimes(1);
        expect(syncMethod).toHaveBeenCalledWith(payload);
        expect(result).toEqual(true);
    });

    describe('test buildBulkSyncPayload', () => {
        const cases = [
            [
                'empty changes',
                [],
                {}
            ],
            [
                'invalid field',
                [{ type: 'overwrite', field: 'invalid-field', value: 'test' }, {
                    type: 'clear',
                    field: 'invalid-field-2',
                    value: 'test'
                }],
                {}
            ],
            [
                'unsupported type',
                [{ type: 'not-support-type', field: 'description', value: 'test' }],
                {}
            ],
            [
                'overwrite single field',
                [{ type: 'overwrite', field: 'description', value: 'test' }],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                description: 'test'
                            },
                            {
                                id: 'product_2',
                                description: 'test'
                            }
                        ]
                    }
                }
            ],
            [
                'overwrite custom field',
                [{ type: 'overwrite', field: 'customFields', value: { custom_health_nostrum_facere_quo: 'lorem ipsum' } }],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                customFields: {
                                    custom_health_nostrum_facere_quo: 'lorem ipsum'
                                }
                            },
                            {
                                id: 'product_2',
                                customFields: {
                                    custom_health_nostrum_facere_quo: 'lorem ipsum'
                                }
                            }
                        ]
                    }
                }
            ],
            [
                'clear single string field',
                [{ type: 'clear', field: 'description' }],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                description: null
                            },
                            {
                                id: 'product_2',
                                description: null
                            }
                        ]
                    }
                }
            ],
            [
                'clear multiple scalar fields',
                [{ type: 'clear', field: 'description' }, { type: 'clear', field: 'stock' }],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                description: null,
                                stock: 0
                            },
                            {
                                id: 'product_2',
                                description: null,
                                stock: 0
                            }
                        ]
                    }
                }
            ],
            [
                'overwrite multiple fields',
                [{ type: 'overwrite', field: 'description', value: 'test' }, {
                    type: 'overwrite',
                    field: 'stock',
                    value: 10
                }],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                description: 'test',
                                stock: 10
                            },
                            {
                                id: 'product_2',
                                description: 'test',
                                stock: 10
                            }
                        ]
                    }
                }
            ],
            [
                'changes with invalid field and unsupported type',
                [{ type: 'overwrite', field: 'description', value: 'test' }, {
                    type: 'overwrite',
                    field: 'invalid-field',
                    value: 10
                }, { type: 'un-support-type', field: 'name', value: 10 }],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                description: 'test'
                            },
                            {
                                id: 'product_2',
                                description: 'test'
                            }
                        ]
                    }
                }
            ],
            [
                'change association with invalid mapping entity',
                [{
                    type: 'overwrite',
                    mappingEntity: 'invalid_mapping_entity',
                    field: 'categoryId',
                    value: ['category_1', 'category_2']
                }],
                {}
            ],
            [
                'change association with invalid mapping entity field',
                [{
                    type: 'overwrite',
                    mappingEntity: 'product_category',
                    field: 'customerId',
                    value: ['category_1', 'category_2']
                }],
                {}
            ],
            [
                'overwrite an association with no duplicated',
                [{
                    type: 'overwrite',
                    mappingEntity: 'product_category',
                    field: 'categoryId',
                    value: ['category_1', 'category_2']
                }],
                {
                    'upsert-product_category': {
                        action: 'upsert',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_1',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_2',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_1',
                                categoryId: 'category_2'
                            },
                            {
                                productId: 'product_2',
                                categoryId: 'category_2'
                            }
                        ]
                    }
                },
                {
                    product_category: []
                }
            ],
            [
                'overwrite an association with some duplicated',
                [{
                    type: 'overwrite',
                    mappingEntity: 'product_category',
                    field: 'categoryId',
                    value: ['category_1', 'category_2']
                }],
                {
                    'upsert-product_category': {
                        action: 'upsert',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_2',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_1',
                                categoryId: 'category_2'
                            }
                        ]
                    },
                    'delete-product_category': {
                        action: 'delete',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_1',
                                categoryId: 'category_3'
                            },
                            {
                                productId: 'product_2',
                                categoryId: 'category_4'
                            }
                        ]
                    }
                },
                {
                    product_category: [
                        {
                            product_id: 'product_1',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_2'
                        },
                        {
                            product_id: 'product_1',
                            category_id: 'category_3'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_4'
                        }
                    ]
                }
            ],
            [
                'overwrite an oneToMany association',
                [{ type: 'overwrite', mappingEntity: 'product_media', field: 'mediaId', value: ['media_1', 'media_2'] }],
                {
                    'upsert-product_media': {
                        action: 'upsert',
                        entity: 'product_media',
                        payload: [
                            {
                                productId: 'product_1',
                                mediaId: 'media_1'
                            },
                            {
                                productId: 'product_2',
                                mediaId: 'media_1'
                            }
                        ]
                    }
                },
                {
                    product_media: [
                        {
                            productId: 'product_1',
                            mediaId: 'media_2'
                        },
                        {
                            productId: 'product_2',
                            mediaId: 'media_2'
                        }
                    ]
                }
            ],
            [
                'overwrite an association with all duplicated',
                [{
                    type: 'overwrite',
                    mappingEntity: 'product_category',
                    field: 'categoryId',
                    value: ['category_1', 'category_2']
                }],
                {},
                {
                    product_category: [
                        {
                            product_id: 'product_1',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_1',
                            category_id: 'category_2'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_2'
                        }
                    ]
                }
            ],
            [
                'overwrite an association with duplicated',
                [{
                    type: 'overwrite',
                    mappingEntity: 'product_category',
                    field: 'categoryId',
                    value: ['category_1', 'category_2']
                }],
                {
                    'upsert-product_category': {
                        action: 'upsert',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_2',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_1',
                                categoryId: 'category_2'
                            }
                        ]
                    }
                },
                {
                    product_category: [
                        {
                            product_id: 'product_1',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_2'
                        }
                    ]

                }
            ],
            [
                'add an association',
                [{
                    type: 'add',
                    mappingEntity: 'product_category',
                    field: 'categoryId',
                    value: ['category_1', 'category_2', 'category_3']
                }],
                {
                    'upsert-product_category': {
                        action: 'upsert',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_2',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_1',
                                categoryId: 'category_2'
                            },
                            {
                                productId: 'product_2',
                                categoryId: 'category_3'
                            }
                        ]
                    }
                },
                {
                    product_category: [
                        {
                            product_id: 'product_1',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_2'
                        },
                        {
                            product_id: 'product_1',
                            category_id: 'category_3'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_4'
                        }
                    ]
                }
            ],
            [
                'remove an association',
                [{
                    type: 'remove',
                    mappingEntity: 'product_category',
                    field: 'categoryId',
                    value: ['category_1', 'category_2']
                }],
                {
                    'delete-product_category': {
                        action: 'delete',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_1',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_2',
                                categoryId: 'category_2'
                            }
                        ]
                    }
                },
                {
                    product_category: [
                        {
                            product_id: 'product_1',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_2'
                        }
                    ]
                }
            ],
            [
                'all operators at once',
                [
                    { type: 'overwrite', field: 'description', value: 'test' },
                    { type: 'clear', field: 'stock' },
                    { type: 'remove', mappingEntity: 'product_media', field: 'mediaId', value: ['media_1'] },
                    {
                        type: 'add',
                        mappingEntity: 'product_category',
                        field: 'categoryId',
                        value: ['category_1', 'category_2']
                    }
                ],
                {
                    'upsert-product': {
                        action: 'upsert',
                        entity: 'product',
                        payload: [
                            {
                                id: 'product_1',
                                description: 'test',
                                stock: 0
                            },
                            {
                                id: 'product_2',
                                description: 'test',
                                stock: 0
                            }
                        ]
                    },
                    'upsert-product_category': {
                        action: 'upsert',
                        entity: 'product_category',
                        payload: [
                            {
                                productId: 'product_2',
                                categoryId: 'category_1'
                            },
                            {
                                productId: 'product_1',
                                categoryId: 'category_2'
                            }
                        ]
                    },
                    'delete-product_media': {
                        action: 'delete',
                        entity: 'product_media',
                        payload: [
                            {
                                id: 'product_media_1'
                            }
                        ]
                    }
                },
                {
                    product_category: [
                        {
                            product_id: 'product_1',
                            category_id: 'category_1'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_2'
                        },
                        {
                            product_id: 'product_1',
                            category_id: 'category_3'
                        },
                        {
                            product_id: 'product_2',
                            category_id: 'category_4'
                        }
                    ],
                    product_media: [
                        {
                            productId: 'product_2',
                            mediaId: 'media_1',
                            id: 'product_media_1'
                        }
                    ]
                }

            ]
        ];

        const bulkEditSyncApiService = getBulkEditApiService();
        bulkEditSyncApiService.entityName = 'product';
        bulkEditSyncApiService.entityIds = ['product_1', 'product_2'];

        it.each(cases)('%s', async (testName, input, output, existAssociations = {}) => {
            const spy = jest.spyOn(console, 'warn').mockImplementation();

            const spyRepository = jest.spyOn(bulkEditSyncApiService.repositoryFactory, 'create').mockImplementation((entity) => {
                return {
                    search: async () => Promise.resolve(existAssociations[entity]),
                    searchIds: async () => Promise.resolve({ data: existAssociations[entity] })
                };
            });

            expect(await bulkEditSyncApiService.buildBulkSyncPayload(input)).toEqual(output);
            spy.mockRestore();

            spyRepository.mockRestore();
        });
    });
});
