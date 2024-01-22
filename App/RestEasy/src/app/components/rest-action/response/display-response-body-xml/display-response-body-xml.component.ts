import { Component, OnInit, Input } from '@angular/core';
import { ContentTypeHelperService } from 'src/app/services/content-type-helper/content-type-helper.service';
import { RestActionResultBody } from '../../../../../../../shared/builder/src';

@Component({
  selector: 'app-display-response-body-xml',
  templateUrl: './display-response-body-xml.component.html',
  styleUrls: ['./display-response-body-xml.component.css']
})
export class DisplayResponseBodyXmlComponent implements OnInit {
  rawData: string = '';
  formattedXml: string = ''
  selectedview: string = "formatted";

  @Input()
  set body(body: RestActionResultBody | undefined) {
    if (body == undefined) {
      this.rawData = '';
      return;
    }

     this.rawData = this.contentTypeHelper.convertArrayBufferToString(body.contentType, body.body);
     this.formattedXml = this.formatXml(this.rawData);
  }

  constructor(private contentTypeHelper: ContentTypeHelperService) { 
  }

  ngOnInit(): void {
  }
 
  onViewChange(event:any){
    console.log(event);
    this.selectedview = event.value;
  } 

  formatXml(data: string): string {
    var xmlDoc = new DOMParser().parseFromString(data, 'application/xml');
    var xsltDoc = new DOMParser().parseFromString([
        // describes how we want to modify the XML - indent everything
        '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
        '  <xsl:strip-space elements="*"/>',
        '  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
        '    <xsl:value-of select="normalize-space(.)"/>',
        '  </xsl:template>',
        '  <xsl:template match="node()|@*">',
        '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
        '  </xsl:template>',
        '  <xsl:output indent="yes"/>',
        '</xsl:stylesheet>',
    ].join('\n'), 'application/xml');

    var xsltProcessor = new XSLTProcessor();    
    xsltProcessor.importStylesheet(xsltDoc);
    var resultDoc = xsltProcessor.transformToDocument(xmlDoc);
    var resultXml = new XMLSerializer().serializeToString(resultDoc);
    return resultXml;
  }
}
