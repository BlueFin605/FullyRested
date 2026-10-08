import { Injectable } from '@angular/core';
import { Collection, HTTP_RESPONSE_CODES, IExecuteRestAction, ResponseValidation, RestActionResult, validateResponse } from '@fullyrested/core';

@Injectable({
  providedIn: 'root'
})
export class ValidateResponseService {
  public httpResponses = HTTP_RESPONSE_CODES;

  public async validateResponse(action: IExecuteRestAction,
                                response: RestActionResult,
                                collection: Collection | undefined): Promise<ResponseValidation | undefined> {
    return validateResponse(action, response);
  }
}
